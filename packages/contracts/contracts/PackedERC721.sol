// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title PackedERC721
 * @notice Benchmark baseline. Writes the same six logical metadata fields as
 *   ReferenceERC721, but using VeriSkillCredential's packed-struct layout
 *   (3 slots instead of 6). No EAS attestation. Used to isolate the storage-
 *   layout savings from the EAS cost so the FR02 gas comparison is fair.
 *
 *   NOT used in production. Local benchmark only.
 *
 * @dev Storage per token (3 slots used vs. ReferenceERC721's 6):
 *   Slot 0: layer(1) + status(1) + issuedAt(5) + updatedAt(5) + padding
 *   Slot 1: skillId
 *   Slot 2: commitHash
 */
contract PackedERC721 is ERC721 {

    struct Credential {
        uint8   layer;
        uint8   status;
        uint40  issuedAt;
        uint40  updatedAt;
        bytes32 skillId;
        bytes32 commitHash;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => Credential) private _credentials;

    constructor() ERC721("Packed ERC721", "PACKED") {
        _nextTokenId = 1;
    }

    function mint(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint8 layer
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;

        _credentials[tokenId] = Credential({
            layer:      layer,
            status:     0,
            issuedAt:   uint40(block.timestamp),
            updatedAt:  uint40(block.timestamp),
            skillId:    skillId,
            commitHash: commitHash
        });

        _mint(to, tokenId); // ERC721 base: writes _owners[tokenId]

        return tokenId;
    }
}
