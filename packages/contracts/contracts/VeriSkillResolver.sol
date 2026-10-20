// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SchemaResolver } from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import { IEAS, Attestation } from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title VeriSkillResolver
 * @notice EAS schema resolver that gates attestations behind the VeriSkillCredential contract.
 *
 * Only one authorised attester — the VeriSkillCredential contract — may call
 * EAS to create or revoke attestations against the VeriSkill schema. All
 * off-chain fraud checks happen before the credential contract fires its
 * attest()/revoke() call, so this resolver only needs to enforce "did the
 * right contract issue this attestation?" plus a trust-layer range check.
 *
 * @dev Deploy order:
 *   1. Deploy VeriSkillResolver(eas)
 *   2. Register schema in SchemaRegistry with this resolver → schemaUid
 *   3. Deploy VeriSkillCredential(admin, eas, schemaUid)
 *   4. resolver.setAttester(credentialContractAddress)
 */
contract VeriSkillResolver is SchemaResolver {
    /// @notice The sole address allowed to attest / revoke via this resolver.
    address public attester;

    /// @notice Address that can rotate the attester (platform admin).
    address public immutable admin;

    uint8 public constant MIN_LAYER = 4; // Mint minimum per TRUST_SCORE.md
    uint8 public constant MAX_LAYER = 6;

    event AttesterSet(address indexed previous, address indexed next);

    error NotAdmin();
    error AttesterNotSet();
    error UnauthorisedAttester(address attester);
    error LayerOutOfRange(uint8 layer);
    error MalformedAttestationData();

    constructor(IEAS _eas, address _admin) SchemaResolver(_eas) {
        require(_admin != address(0), "VeriSkillResolver: admin is zero");
        admin = _admin;
    }

    function setAttester(address _attester) external {
        if (msg.sender != admin) revert NotAdmin();
        require(_attester != address(0), "VeriSkillResolver: attester is zero");
        emit AttesterSet(attester, _attester);
        attester = _attester;
    }

    /**
     * @dev EAS hook — called by EAS.attest() before the attestation is stored.
     * We require the authorised credential contract to be msg.sender upstream
     * (recorded in attestation.attester) and validate the trust-layer range.
     *
     * Schema (set in SchemaRegistry at deploy time):
     *   bytes32 skillId, bytes32 commitHash, uint8 layer, uint256 tokenId
     */
    function onAttest(
        Attestation calldata attestation,
        uint256 /* value */
    ) internal view override returns (bool) {
        if (attester == address(0)) revert AttesterNotSet();
        if (attestation.attester != attester) revert UnauthorisedAttester(attestation.attester);
        if (attestation.data.length != 128) revert MalformedAttestationData();

        // Decode layer (3rd field, uint8 padded to 32 bytes in ABI encoding).
        (, , uint8 layer, ) = abi.decode(attestation.data, (bytes32, bytes32, uint8, uint256));
        if (layer < MIN_LAYER || layer > MAX_LAYER) revert LayerOutOfRange(layer);

        return true;
    }

    /**
     * @dev EAS hook — called by EAS.revoke(). Only the authorised credential
     * contract may revoke; it already enforces its own role checks before calling.
     */
    function onRevoke(
        Attestation calldata attestation,
        uint256 /* value */
    ) internal view override returns (bool) {
        if (attester == address(0)) revert AttesterNotSet();
        if (attestation.attester != attester) revert UnauthorisedAttester(attestation.attester);
        return true;
    }
}
