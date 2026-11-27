// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title PackedERC721BadOrder
 * @notice Benchmark-only. Same six fields as PackedERC721, but the struct
 *   fields are declared in a poor order so Solidity cannot fit the four small
 *   values (`uint8 + uint8 + uint40 + uint40` = 12 bytes) into one slot.
 *
 *   Illustrates that struct declaration order, not field types, controls the
 *   packing. Each `bytes32` interrupts a packing run, so the small fields each
 *   end up in their own slot.
 *
 *   Not used in production.
 *
 * @dev Expected layout (5 slots instead of 3):
 *   Slot 0: skillId
 *   Slot 1: layer(1) + padding(31)
 *   Slot 2: commitHash
 *   Slot 3: status(1) + issuedAt(5) + updatedAt(5) + padding(21)
 */
contract PackedERC721BadOrder is ERC721 {

    struct Credential {
        bytes32 skillId;
        uint8   layer;
        bytes32 commitHash;
        uint8   status;
        uint40  issuedAt;
        uint40  updatedAt;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => Credential) private _credentials;

    constructor() ERC721("Packed ERC721 (bad order)", "BADPACK") {
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
            skillId:    skillId,
            layer:      layer,
            commitHash: commitHash,
            status:     0,
            issuedAt:   uint40(block.timestamp),
            updatedAt:  uint40(block.timestamp)
        });
        _mint(to, tokenId);
        return tokenId;
    }
}
