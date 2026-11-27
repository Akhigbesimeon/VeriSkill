// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title BlobERC721
 * @notice Benchmark-only. Second common real-world pattern: credential fields
 *   ABI-encoded into a single `bytes` blob per token. One `bytes` write for the
 *   whole metadata bundle, then decode on read. This is cheaper to update
 *   when there are many small fields but hides the shape of the data and
 *   pays a `MLOAD/CALLDATACOPY + SSTORE` overhead for the length prefix.
 *
 *   Not used in production.
 */
contract BlobERC721 is ERC721 {

    uint256 private _nextTokenId;
    mapping(uint256 => bytes) private _blob;

    constructor() ERC721("Blob ERC721", "BLOB") {
        _nextTokenId = 1;
    }

    function mint(
        address to,
        bytes32 skillId,
        bytes32 commitHash,
        uint8 layer
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _blob[tokenId] = abi.encode(
            layer,
            uint8(0),              // status = ACTIVE
            uint40(block.timestamp), // issuedAt
            uint40(block.timestamp), // updatedAt
            skillId,
            commitHash
        );
        _mint(to, tokenId);
        return tokenId;
    }
}
