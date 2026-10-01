// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title VeriSkillCredential
 * @notice Non-transferable (soulbound) credential token for the VeriSkill platform.
 *
 * Each credential represents a verified skill claim by a developer. The contract
 * stores a cryptographic commitment hash that binds the on-chain record to
 * off-chain evidence without storing any personal data or evidence URLs on-chain.
 *
 * Verification layers (1–6) and lifecycle status (ACTIVE, SUSPENDED, REVOKED) are
 * stored in a tightly packed struct consuming exactly 3 storage slots per credential.
 *
 * @dev Storage layout per credential (3 slots, 96 bytes):
 *   Slot 0: uint8 layer | uint8 status | uint40 issuedAt | uint40 updatedAt | bytes12 padding
 *   Slot 1: bytes32 skillId
 *   Slot 2: bytes32 commitHash
 *
 *   Owner is tracked by ERC721's internal _owners mapping — not duplicated here.
 *
 * @dev Non-transferability is enforced by overriding _update() to revert on any
 *   operation after the initial mint (i.e. when _ownerOf(tokenId) != address(0)).
 *   approve() and setApprovalForAll() are also overridden to revert immediately,
 *   preventing dangling approvals that can never be exercised.
 *
 * @dev On-chain data commitment:
 *   commitHash = keccak256(abi.encode(
 *     ownerAddress, skillId, evidenceSetHash, layer, issuedAt
 *   ))
 *   This is computed off-chain by the backend and written on-chain.
 *   No names, emails, evidence URLs, or review notes are stored on-chain.
 *
 * @dev Role architecture (least-privilege):
 *   ISSUER_ROLE   — mint new credentials
 *   UPDATER_ROLE  — update layer and commitHash
 *   REVOKER_ROLE  — suspend, unsuspend, and revoke credentials
 *   DEFAULT_ADMIN_ROLE — grant/revoke all roles
 */
contract VeriSkillCredential is ERC721, AccessControl {

    // ─── Role identifiers ─────────────────────────────────────────────────────

    bytes32 public constant ISSUER_ROLE  = keccak256("ISSUER_ROLE");
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Minimum verification layer required before a credential can be minted.
    /// @dev Layer 4 = Peer Verified (≥1 peer approval). Enforced at mint time.
    uint8 public constant MIN_LAYER_TO_MINT = 4;

    /// @notice Maximum valid verification layer value.
    uint8 public constant MAX_LAYER = 6;

    // ─── Enumerations ─────────────────────────────────────────────────────────

    /**
     * @notice Lifecycle status of a credential.
     * @dev Stored as uint8 in the packed struct (1 byte).
     *   ACTIVE    — credential is live and valid
     *   SUSPENDED — temporarily frozen by admin; QR returns "suspended"
     *   REVOKED   — permanently invalidated; cannot be restored
     */
    enum Status { ACTIVE, SUSPENDED, REVOKED }

    // ─── Credential storage ───────────────────────────────────────────────────

    /**
     * @notice Tightly packed credential record — 3 storage slots exactly.
     * @dev Slot 0 packing: layer(1) + status(1) + issuedAt(5) + updatedAt(5) + padding(20)
     *   Padding bytes are unused and default to zero. Solidity packs from the
     *   least-significant byte, so the 12 remaining bytes in slot 0 are zero.
     *   bytes32 fields each occupy one full slot.
     */
    struct Credential {
        // ── Slot 0 ──────────────────────────────────────────────────────────
        uint8   layer;      // Verification layer 1–6 (see VERIFICATION_LAYERS in shared/)
        uint8   status;     // Status enum value (0=ACTIVE, 1=SUSPENDED, 2=REVOKED)
        uint40  issuedAt;   // Unix timestamp of mint; valid until year 36,812
        uint40  updatedAt;  // Unix timestamp of last on-chain update
        // 12 bytes padding to complete slot 0 — unused
        // ── Slot 1 ──────────────────────────────────────────────────────────
        bytes32 skillId;    // keccak256(abi.encodePacked(skillName, skillVersion))
        // ── Slot 2 ──────────────────────────────────────────────────────────
        bytes32 commitHash; // Top-level cryptographic commitment (see @dev above)
    }

    /// @dev tokenId → Credential
    mapping(uint256 => Credential) private _credentials;

    /// @dev Auto-incrementing token ID counter. Starts at 1; 0 is reserved as "no token".
    uint256 private _nextTokenId;

    // ─── Events ───────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new credential is minted.
     * @param tokenId  Unique credential identifier.
     * @param owner    Developer's wallet address.
     * @param skillId  Hashed skill identifier (not the plain-text skill name).
     * @param layer    Verification layer at time of mint (must be ≥ MIN_LAYER_TO_MINT).
     * @param commitHash Cryptographic commitment to credential metadata.
     * @param issuedAt Unix timestamp of minting.
     */
    event CredentialMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 indexed skillId,
        uint8   layer,
        bytes32 commitHash,
        uint40  issuedAt
    );

    /**
     * @notice Emitted when a credential's verification layer or commitHash is updated.
     * @param tokenId      Credential identifier.
     * @param oldLayer     Previous verification layer.
     * @param newLayer     New verification layer.
     * @param newCommitHash Updated commitment reflecting the new evidence state.
     * @param updatedAt    Unix timestamp of the update.
     */
    event LayerUpdated(
        uint256 indexed tokenId,
        uint8   oldLayer,
        uint8   newLayer,
        bytes32 newCommitHash,
        uint40  updatedAt
    );

    /**
     * @notice Emitted when a credential's lifecycle status changes.
     * @param tokenId   Credential identifier.
     * @param oldStatus Previous status value.
     * @param newStatus New status value.
     * @param changedAt Unix timestamp of the status change.
     */
    event StatusChanged(
        uint256 indexed tokenId,
        uint8   oldStatus,
        uint8   newStatus,
        uint40  changedAt
    );

    /**
     * @notice Emitted when a credential is permanently revoked.
     * @param tokenId   Credential identifier.
     * @param owner     Developer's wallet address.
     * @param revokedAt Unix timestamp of revocation.
     */
    event CredentialRevoked(
        uint256 indexed tokenId,
        address indexed owner,
        uint40  revokedAt
    );

    // ─── Custom errors ────────────────────────────────────────────────────────

    /// @notice Thrown on any attempted transfer or approval of a soulbound token.
    error NonTransferable();

    /// @notice Thrown when operating on a token that does not exist.
    error CredentialNotFound(uint256 tokenId);

    /// @notice Thrown when a layer value is outside the valid range 1–6.
    error InvalidLayer(uint8 layer);

    /// @notice Thrown when minting with a layer below MIN_LAYER_TO_MINT.
    error LayerBelowMintMinimum(uint8 required, uint8 provided);

    /// @notice Thrown when attempting to modify a revoked credential.
    error CredentialAlreadyRevoked(uint256 tokenId);

    /// @notice Thrown when suspending an already-suspended credential.
    error CredentialAlreadySuspended(uint256 tokenId);

    /// @notice Thrown when unsuspending a credential that is not suspended.
    error CredentialNotSuspended(uint256 tokenId);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param admin Address that receives DEFAULT_ADMIN_ROLE and REVOKER_ROLE.
     *   In production this is the platform admin account.
     *   The deployer does NOT automatically retain admin rights — the admin
     *   address is passed explicitly to avoid deployment-key privilege escalation.
     */
    constructor(address admin) ERC721("VeriSkill Credential", "VSC") {
        require(admin != address(0), "VeriSkill: admin cannot be zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REVOKER_ROLE, admin);
        // ISSUER_ROLE and UPDATER_ROLE are granted separately by the admin
        // to the platform backend account — not granted at deploy time.
        _nextTokenId = 1; // Token IDs start at 1
    }

    // ─── Write functions ──────────────────────────────────────────────────────

    /**
     * @notice Mint a new non-transferable credential to a developer's wallet.
     * @dev Only callable by ISSUER_ROLE.
     *   The commitHash must be computed off-chain as:
     *   keccak256(abi.encode(to, skillId, evidenceSetHash, layer, block.timestamp))
     *   Enforces MIN_LAYER_TO_MINT (4) — credentials must have peer approval before minting.
     *
     * @param to         Developer's wallet address (managed or self-custody).
     * @param skillId    keccak256(abi.encodePacked(skillName, skillVersion)).
     * @param commitHash Cryptographic commitment computed by the backend.
     * @param layer      Verification layer at time of mint. Must be ≥ MIN_LAYER_TO_MINT.
     * @return tokenId   The newly assigned credential token ID.
     */
    function mintCredential(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint8   layer
    ) external onlyRole(ISSUER_ROLE) returns (uint256) {
        // Validate layer range
        if (layer < MIN_LAYER_TO_MINT || layer > MAX_LAYER) {
            if (layer < MIN_LAYER_TO_MINT) revert LayerBelowMintMinimum(MIN_LAYER_TO_MINT, layer);
            revert InvalidLayer(layer);
        }

        uint256 tokenId = _nextTokenId++;
        uint40 timestamp = uint40(block.timestamp);

        // Write credential data (3 storage slots)
        _credentials[tokenId] = Credential({
            layer:      layer,
            status:     uint8(Status.ACTIVE),
            issuedAt:   timestamp,
            updatedAt:  timestamp,
            skillId:    skillId,
            commitHash: commitHash
        });

        // ERC721 mint — writes _owners[tokenId] = to
        _mint(to, tokenId);

        emit CredentialMinted(tokenId, to, skillId, layer, commitHash, timestamp);

        return tokenId;
    }

    /**
     * @notice Update the verification layer and commitment hash of an existing credential.
     * @dev Only callable by UPDATER_ROLE. Used when evidence is added/removed,
     *   peer reviews accumulate, or expert review is completed.
     *   Cannot be called on a revoked credential — revocation is permanent.
     *
     * @param tokenId       Credential to update.
     * @param newLayer      New verification layer (1–6).
     * @param newCommitHash Updated commitment reflecting the current evidence state.
     */
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

    /**
     * @notice Temporarily suspend a credential pending investigation.
     * @dev Only callable by REVOKER_ROLE. Suspension is reversible via unsuspendCredential().
     *   A suspended credential's QR code returns "suspended" to recruiters.
     *   Cannot suspend a revoked credential.
     *
     * @param tokenId Credential to suspend.
     */
    function suspendCredential(uint256 tokenId) external onlyRole(REVOKER_ROLE) {
        _requireExists(tokenId);
        Credential storage cred = _credentials[tokenId];

        if (cred.status == uint8(Status.REVOKED))   revert CredentialAlreadyRevoked(tokenId);
        if (cred.status == uint8(Status.SUSPENDED))  revert CredentialAlreadySuspended(tokenId);

        uint8 oldStatus = cred.status;
        uint40 timestamp = uint40(block.timestamp);
        cred.status    = uint8(Status.SUSPENDED);
        cred.updatedAt = timestamp;

        emit StatusChanged(tokenId, oldStatus, uint8(Status.SUSPENDED), timestamp);
    }

    /**
     * @notice Lift a suspension and restore a credential to ACTIVE status.
     * @dev Only callable by REVOKER_ROLE. The credential returns to ACTIVE —
     *   its layer and commitHash are unchanged by this operation.
     *
     * @param tokenId Credential to unsuspend.
     */
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
     * @notice Permanently revoke a credential.
     * @dev Only callable by REVOKER_ROLE. Revocation is irreversible.
     *   The token is NOT burned — it remains owned by the developer
     *   but its status is permanently REVOKED. The QR code returns "revoked".
     *   Can revoke from either ACTIVE or SUSPENDED state.
     *
     * @param tokenId Credential to revoke.
     */
    function revokeCredential(uint256 tokenId) external onlyRole(REVOKER_ROLE) {
        _requireExists(tokenId);
        Credential storage cred = _credentials[tokenId];

        if (cred.status == uint8(Status.REVOKED)) revert CredentialAlreadyRevoked(tokenId);

        uint8 oldStatus = cred.status;
        uint40 timestamp = uint40(block.timestamp);
        address owner = ownerOf(tokenId);

        cred.status    = uint8(Status.REVOKED);
        cred.updatedAt = timestamp;

        emit StatusChanged(tokenId, oldStatus, uint8(Status.REVOKED), timestamp);
        emit CredentialRevoked(tokenId, owner, timestamp);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /**
     * @notice Return the full credential record for a given token.
     * @param tokenId Credential identifier.
     * @return Credential struct (layer, status, issuedAt, updatedAt, skillId, commitHash).
     */
    function getCredential(uint256 tokenId) external view returns (Credential memory) {
        _requireExists(tokenId);
        return _credentials[tokenId];
    }

    /**
     * @notice Return only the commitment hash for efficient verification queries.
     * @param tokenId Credential identifier.
     * @return commitHash The current cryptographic commitment.
     */
    function getCommitHash(uint256 tokenId) external view returns (bytes32) {
        _requireExists(tokenId);
        return _credentials[tokenId].commitHash;
    }

    /**
     * @notice Check whether a credential has been permanently revoked.
     * @param tokenId Credential identifier.
     * @return True if the credential status is REVOKED.
     */
    function isRevoked(uint256 tokenId) external view returns (bool) {
        _requireExists(tokenId);
        return _credentials[tokenId].status == uint8(Status.REVOKED);
    }

    /**
     * @notice Return the total number of credentials minted (including revoked ones).
     * @dev _nextTokenId starts at 1, so total minted = _nextTokenId - 1.
     */
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ─── Non-transferability enforcement ──────────────────────────────────────

    /**
     * @notice Block all token transfers and burns after the initial mint.
     * @dev Overrides ERC721._update() which is called by _mint(), _transfer(),
     *   and _burn(). Minting (from == address(0)) is allowed.
     *   All other operations revert with NonTransferable().
     *   This single override covers transferFrom, safeTransferFrom, and burn.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Block everything except the initial mint
        if (from != address(0)) revert NonTransferable();
        return super._update(to, tokenId, auth);
    }

    /**
     * @notice Block approval setting — approvals are meaningless on soulbound tokens.
     * @dev Overrides ERC721.approve() to revert immediately.
     */
    function approve(address, uint256) public pure override {
        revert NonTransferable();
    }

    /**
     * @notice Block operator approval — meaningless on soulbound tokens.
     * @dev Overrides ERC721.setApprovalForAll() to revert immediately.
     */
    function setApprovalForAll(address, bool) public pure override {
        revert NonTransferable();
    }

    // ─── Interface support ────────────────────────────────────────────────────

    /**
     * @notice Declare support for ERC721 and AccessControl interfaces.
     * @dev Required override when inheriting from both ERC721 and AccessControl
     *   in OpenZeppelin v5, as both implement supportsInterface.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /**
     * @dev Revert with CredentialNotFound if the token has not been minted.
     *   Uses _ownerOf() which returns address(0) for non-existent tokens.
     */
    function _requireExists(uint256 tokenId) internal view {
        if (_ownerOf(tokenId) == address(0)) revert CredentialNotFound(tokenId);
    }
}
