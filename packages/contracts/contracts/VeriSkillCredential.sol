// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IEAS, AttestationRequest, AttestationRequestData, RevocationRequest, RevocationRequestData } from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title VeriSkillCredential (hybrid ERC721 + EAS attestation)
 * @notice Non-transferable (soulbound) credential NFT that additionally mirrors
 *   each credential as an EAS attestation for ecosystem interoperability.
 *
 * Design:
 *   - The ERC721 record is authoritative for VeriSkill's own backend (owner,
 *     lifecycle status, packed metadata).
 *   - On every mint, the contract also writes an EAS attestation against the
 *     VeriSkill schema. The attestation's UID is stored next to the credential.
 *   - On revoke, both the on-chain status flips to REVOKED and the EAS
 *     attestation is revoked. ERC721 ownership is preserved by design.
 *   - Suspend / unsuspend are platform-local state; they do not touch EAS,
 *     since EAS has no concept of a reversible pause.
 *
 * @dev Storage layout per credential (3 slots used, bump to 4 with EAS UID):
 *   Slot 0: layer(1) + status(1) + issuedAt(5) + updatedAt(5) + padding(20)
 *   Slot 1: skillId
 *   Slot 2: commitHash
 *   Slot 3: easAttestationUid
 */
contract VeriSkillCredential is ERC721, AccessControl, EIP712 {

    bytes32 public constant ISSUER_ROLE  = keccak256("ISSUER_ROLE");
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");

    // EIP-712 typehash for the mint voucher. The backend holding ISSUER_ROLE
    // signs this; the developer submits the signed voucher via mintWithVoucher,
    // so the on-chain actor is the developer's own wallet while the backend
    // still gates whether a mint is allowed.
    bytes32 public constant MINT_VOUCHER_TYPEHASH = keccak256(
        "MintVoucher(address to,bytes32 skillId,bytes32 commitHash,uint8 layer,uint256 deadline,uint256 nonce)"
    );

    // Per-recipient nonce — prevents replay of the same voucher twice.
    mapping(address => uint256) private _nonces;

    uint8 public constant MIN_LAYER_TO_MINT = 4;
    uint8 public constant MAX_LAYER = 6;

    enum Status { ACTIVE, SUSPENDED, REVOKED }

    struct Credential {
        uint8   layer;
        uint8   status;
        uint40  issuedAt;
        uint40  updatedAt;
        bytes32 skillId;
        bytes32 commitHash;
        bytes32 easAttestationUid; // EAS UID returned by attest(); 0 if attestation disabled
    }

    mapping(uint256 => Credential) private _credentials;
    uint256 private _nextTokenId;

    IEAS public immutable eas;
    bytes32 public immutable schemaUid;

    event CredentialMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 indexed skillId,
        uint8   layer,
        bytes32 commitHash,
        uint40  issuedAt
    );

    event CredentialAttested(
        uint256 indexed tokenId,
        bytes32 indexed easUid
    );

    event LayerUpdated(
        uint256 indexed tokenId,
        uint8   oldLayer,
        uint8   newLayer,
        bytes32 newCommitHash,
        uint40  updatedAt
    );

    event StatusChanged(
        uint256 indexed tokenId,
        uint8   oldStatus,
        uint8   newStatus,
        uint40  changedAt
    );

    event CredentialRevoked(
        uint256 indexed tokenId,
        address indexed owner,
        uint40  revokedAt
    );

    error NonTransferable();
    error CredentialNotFound(uint256 tokenId);
    error InvalidLayer(uint8 layer);
    error LayerBelowMintMinimum(uint8 required, uint8 provided);
    error CredentialAlreadyRevoked(uint256 tokenId);
    error CredentialAlreadySuspended(uint256 tokenId);
    error CredentialNotSuspended(uint256 tokenId);
    error VoucherExpired(uint256 deadline, uint256 nowTs);
    error VoucherRecipientMismatch(address expected, address caller);
    error VoucherSignerUnauthorized(address signer);

    /**
     * @param admin      Address granted DEFAULT_ADMIN_ROLE + REVOKER_ROLE.
     * @param _eas       EAS core contract (0xC2679f...1815e on Sepolia).
     * @param _schemaUid Schema UID registered against VeriSkillResolver.
     */
    constructor(
        address admin,
        IEAS _eas,
        bytes32 _schemaUid
    ) ERC721("VeriSkill Credential", "VSC") EIP712("VeriSkillCredential", "1") {
        require(admin != address(0), "VeriSkill: admin cannot be zero address");
        require(address(_eas) != address(0), "VeriSkill: EAS cannot be zero address");
        require(_schemaUid != bytes32(0), "VeriSkill: schemaUid cannot be zero");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REVOKER_ROLE, admin);
        eas = _eas;
        schemaUid = _schemaUid;
        _nextTokenId = 1;
    }

    /**
     * @notice Mint a new soulbound credential and mirror it as an EAS attestation.
     * @dev Only callable by ISSUER_ROLE. Returns the ERC721 token ID.
     *   The EAS UID is stored in the credential record and emitted via CredentialAttested.
     */
    function mintCredential(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint8   layer
    ) external onlyRole(ISSUER_ROLE) returns (uint256) {
        return _doMint(to, skillId, commitHash, layer);
    }

    /**
     * @notice Mint using an EIP-712 signed voucher from an ISSUER_ROLE holder.
     * @dev The developer calls this from their own wallet (msg.sender == to).
     *   The off-chain backend verifies the credential, then signs the voucher;
     *   the developer pays gas and triggers the on-chain action. Replay is
     *   prevented by a per-recipient nonce.
     */
    function mintWithVoucher(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint8   layer,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256) {
        if (block.timestamp > deadline) revert VoucherExpired(deadline, block.timestamp);
        if (msg.sender != to) revert VoucherRecipientMismatch(to, msg.sender);

        uint256 nonce = _nonces[to];
        bytes32 structHash = keccak256(abi.encode(
            MINT_VOUCHER_TYPEHASH, to, skillId, commitHash, layer, deadline, nonce
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (!hasRole(ISSUER_ROLE, signer)) revert VoucherSignerUnauthorized(signer);

        _nonces[to] = nonce + 1;
        return _doMint(to, skillId, commitHash, layer);
    }

    /// Current nonce for `user`. The backend reads this when building a voucher.
    function nonces(address user) external view returns (uint256) {
        return _nonces[user];
    }

    function _doMint(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint8   layer
    ) internal returns (uint256) {
        if (layer < MIN_LAYER_TO_MINT) revert LayerBelowMintMinimum(MIN_LAYER_TO_MINT, layer);
        if (layer > MAX_LAYER) revert InvalidLayer(layer);

        uint256 tokenId = _nextTokenId++;
        uint40 timestamp = uint40(block.timestamp);

        _credentials[tokenId] = Credential({
            layer:             layer,
            status:            uint8(Status.ACTIVE),
            issuedAt:          timestamp,
            updatedAt:         timestamp,
            skillId:           skillId,
            commitHash:        commitHash,
            easAttestationUid: bytes32(0) // filled below
        });

        _mint(to, tokenId);

        emit CredentialMinted(tokenId, to, skillId, layer, commitHash, timestamp);

        // EAS attestation — resolver enforces that this contract is the attester.
        // revocable=true so revokeCredential() can tear it down later.
        bytes32 easUid = eas.attest(
            AttestationRequest({
                schema: schemaUid,
                data: AttestationRequestData({
                    recipient:     to,
                    expirationTime: 0, // 0 = no expiry; score decay handled off-chain
                    revocable:     true,
                    refUID:        bytes32(0),
                    data:          abi.encode(skillId, commitHash, layer, tokenId),
                    value:         0
                })
            })
        );

        _credentials[tokenId].easAttestationUid = easUid;
        emit CredentialAttested(tokenId, easUid);

        return tokenId;
    }

    function updateLayer(
        uint256 tokenId,
        uint8   newLayer,
        bytes32 newCommitHash
    ) external onlyRole(UPDATER_ROLE) {
        _requireExists(tokenId);
        if (newLayer < 1 || newLayer > MAX_LAYER) revert InvalidLayer(newLayer);

        Credential storage cred = _credentials[tokenId];
        if (cred.status == uint8(Status.REVOKED)) revert CredentialAlreadyRevoked(tokenId);

        uint8 oldLayer = cred.layer;
        uint40 timestamp = uint40(block.timestamp);

        cred.layer      = newLayer;
        cred.commitHash = newCommitHash;
        cred.updatedAt  = timestamp;

        emit LayerUpdated(tokenId, oldLayer, newLayer, newCommitHash, timestamp);
    }

    function suspendCredential(uint256 tokenId) external onlyRole(REVOKER_ROLE) {
        _requireExists(tokenId);
        Credential storage cred = _credentials[tokenId];

        if (cred.status == uint8(Status.REVOKED))  revert CredentialAlreadyRevoked(tokenId);
        if (cred.status == uint8(Status.SUSPENDED)) revert CredentialAlreadySuspended(tokenId);

        uint8 oldStatus = cred.status;
        uint40 timestamp = uint40(block.timestamp);
        cred.status    = uint8(Status.SUSPENDED);
        cred.updatedAt = timestamp;

        emit StatusChanged(tokenId, oldStatus, uint8(Status.SUSPENDED), timestamp);
    }

    function unsuspendCredential(uint256 tokenId) external onlyRole(REVOKER_ROLE) {
        _requireExists(tokenId);
        Credential storage cred = _credentials[tokenId];

        if (cred.status == uint8(Status.REVOKED))  revert CredentialAlreadyRevoked(tokenId);
        if (cred.status != uint8(Status.SUSPENDED)) revert CredentialNotSuspended(tokenId);

        uint8 oldStatus = cred.status;
        uint40 timestamp = uint40(block.timestamp);
        cred.status    = uint8(Status.ACTIVE);
        cred.updatedAt = timestamp;

        emit StatusChanged(tokenId, oldStatus, uint8(Status.ACTIVE), timestamp);
    }

    /**
     * @notice Permanently revoke a credential, including its EAS attestation.
     * @dev Token stays owned by the developer; status flips to REVOKED and the
     *   EAS attestation is revoked so recruiters cannot show it as valid.
     */
    function revokeCredential(uint256 tokenId) external onlyRole(REVOKER_ROLE) {
        _requireExists(tokenId);
        Credential storage cred = _credentials[tokenId];

        if (cred.status == uint8(Status.REVOKED)) revert CredentialAlreadyRevoked(tokenId);

        uint8 oldStatus = cred.status;
        uint40 timestamp = uint40(block.timestamp);
        address owner = ownerOf(tokenId);
        bytes32 easUid = cred.easAttestationUid;

        cred.status    = uint8(Status.REVOKED);
        cred.updatedAt = timestamp;

        emit StatusChanged(tokenId, oldStatus, uint8(Status.REVOKED), timestamp);
        emit CredentialRevoked(tokenId, owner, timestamp);

        if (easUid != bytes32(0)) {
            eas.revoke(
                RevocationRequest({
                    schema: schemaUid,
                    data: RevocationRequestData({ uid: easUid, value: 0 })
                })
            );
        }
    }

    function getCredential(uint256 tokenId) external view returns (Credential memory) {
        _requireExists(tokenId);
        return _credentials[tokenId];
    }

    function getCommitHash(uint256 tokenId) external view returns (bytes32) {
        _requireExists(tokenId);
        return _credentials[tokenId].commitHash;
    }

    function getAttestationUid(uint256 tokenId) external view returns (bytes32) {
        _requireExists(tokenId);
        return _credentials[tokenId].easAttestationUid;
    }

    function isRevoked(uint256 tokenId) external view returns (bool) {
        _requireExists(tokenId);
        return _credentials[tokenId].status == uint8(Status.REVOKED);
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert NonTransferable();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert NonTransferable();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _requireExists(uint256 tokenId) internal view {
        if (_ownerOf(tokenId) == address(0)) revert CredentialNotFound(tokenId);
    }
}
