// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title ReferenceERC721
 * @notice Naive reference implementation for gas comparison against VeriSkillCredential.
 *
 * Stores the same logical data as VeriSkillCredential but WITHOUT:
 *   - Struct packing (uses uint256 for all values)
 *   - Slot optimization (separate mappings per field)
 *   - viaIR optimizer benefits
 *
 * This is NOT used in production. It exists solely to provide a fair gas
 * measurement baseline for the 30% reduction target in the Phase 0 spec.
 *
 * Storage per token (7 mappings × 1 slot each = 7 slots vs. VeriSkill's 3):
 *   _layer:      mapping(uint256 => uint256)  — 1 slot (wastes 31 bytes)
 *   _status:     mapping(uint256 => uint256)  — 1 slot (wastes 31 bytes)
 *   _issuedAt:   mapping(uint256 => uint256)  — 1 slot (wastes 5 bytes vs uint40)
 *   _updatedAt:  mapping(uint256 => uint256)  — 1 slot (wastes 5 bytes vs uint40)
 *   _skillId:    mapping(uint256 => bytes32)  — 1 slot
 *   _commitHash: mapping(uint256 => bytes32)  — 1 slot
 *   ERC721._owners: already written by base   — 1 slot
 *
 * Total: 7 cold storage writes vs. VeriSkill's 4 (3 struct slots + _owners).
 */
contract ReferenceERC721 is ERC721 {

    uint256 private _nextTokenId;

    // Naively typed — no packing, no struct optimization
    mapping(uint256 => uint256) private _layer;
    mapping(uint256 => uint256) private _status;
    mapping(uint256 => uint256) private _issuedAt;
    mapping(uint256 => uint256) private _updatedAt;
    mapping(uint256 => bytes32) private _skillId;
    mapping(uint256 => bytes32) private _commitHash;

    constructor() ERC721("Reference ERC721", "REF") {
        _nextTokenId = 1;
    }

    function mint(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint256 layer
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;

        // 6 separate cold storage writes — no packing
        _layer[tokenId]      = layer;
        _status[tokenId]     = 0; // active
        _issuedAt[tokenId]   = block.timestamp;
        _updatedAt[tokenId]  = block.timestamp;
        _skillId[tokenId]    = skillId;
        _commitHash[tokenId] = commitHash;

        _mint(to, tokenId); // ERC721 base: writes _owners[tokenId]

        return tokenId;
    }
}
