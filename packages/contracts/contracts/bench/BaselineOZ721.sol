// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title BaselineOZ721
 * @notice Benchmark-only. Common real-world baseline: unmodified OpenZeppelin
 *   ERC721 with the credential fields held in one struct mapping. Exposes both
 *   `mint` (uses `_mint`) and `safeMint` (uses `_safeMint`) so the benchmark
 *   can measure the ERC721Receiver check cost independently.
 *
 *   Not used in production.
 */
contract BaselineOZ721 is ERC721 {

    struct Metadata {
        uint256 layer;
        uint256 status;
        uint256 issuedAt;
        uint256 updatedAt;
        bytes32 skillId;
        bytes32 commitHash;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => Metadata) private _metadata;

    constructor() ERC721("Baseline OZ 721", "OZ721") {
        _nextTokenId = 1;
    }

    function mint(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint256 layer
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _metadata[tokenId] = Metadata({
            layer:      layer,
            status:     0,
            issuedAt:   block.timestamp,
            updatedAt:  block.timestamp,
            skillId:    skillId,
            commitHash: commitHash
        });
        _mint(to, tokenId);
        return tokenId;
    }

    function safeMint(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint256 layer
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _metadata[tokenId] = Metadata({
            layer:      layer,
            status:     0,
            issuedAt:   block.timestamp,
            updatedAt:  block.timestamp,
            skillId:    skillId,
            commitHash: commitHash
        });
        _safeMint(to, tokenId);
        return tokenId;
    }
}
