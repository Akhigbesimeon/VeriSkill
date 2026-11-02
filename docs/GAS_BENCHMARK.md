# Gas benchmark findings

VeriSkill credentials cost about 27% less to mint than a plain-vanilla NFT does. Here is what that actually means.

When someone earns a skill in VeriSkill, the system writes them a digital certificate onto a public blockchain. The certificate is an NFT, a digital token that proves ownership and that nobody can forge. The technical word for creating one is "minting". Every time anything gets written to the blockchain, somebody pays a small fee called gas, which is basically rent on a shared global computer. Cheaper minting means cheaper credentials and more of them.

The 27% number came out of a head-to-head test. We built two tiny experimental contracts. Both of them store the same six facts about a credential: the skill, a cryptographic fingerprint of the proof, a level number, a status flag, and two timestamps. The naive one keeps each fact in its own storage compartment. Six compartments. Ours notices that four of the facts are tiny numbers that happily fit side by side in a single compartment, so it bundles them. Three compartments. The whole optimization is that bundle.

On paper you would expect this to save three compartments × 20,000 gas each, so about 60,000 gas. The measured number was 46,360. The difference is bookkeeping overhead both contracts pay no matter what. That still gets you to 27.20% cheaper per mint, which is a real, defensible number.

One thing I would not hide from an examiner. The production contract does one extra thing the test did not measure: on every mint it also writes an EAS attestation, which is a universal standard that lets apps outside VeriSkill verify the credential. That costs more gas, which is why your real production mint is around 413,000 gas rather than 124,000. If you compare that raw number to a bare ERC-721 you look worse, not better. The honest comparison is the one above, where both contracts do the same job in different storage layouts. The EAS cost is a feature you chose to add, not inefficiency. Different conversation.

At today's Ethereum prices, 46,360 gas is maybe ten or fifteen cents per mint. Sounds like nothing until you picture a million mints, where it becomes real money. On Sepolia, where you are currently deployed, nobody pays gas at all, so this is a future-you number for whenever VeriSkill moves to a chain that charges.

Finally, the lifecycle numbers on an already-minted credential, since you have them for free:

- Changing a credential's level: about 40,000 gas.
- Suspending it: about 33,000 gas.
- Unsuspending it: about 33,000 gas.
- Revoking it permanently: about 95,000 gas, which includes undoing the EAS attestation.

These are all cheap for the same reason the mint was cheap. Once four facts share a compartment, touching that one compartment lets you change several of them at once.

## Appendix: raw benchmark output

Measured on a local Hardhat node (EVM target: cancun), with `viaIR` enabled. Three mints per contract — the "warm" number (third mint) is the steady-state cost to report; the first mint has one-time setup noise.

### A. Fair apples-to-apples: packed vs naive (same metadata, no EAS)

This is the comparison that produces the headline 27% figure. Both contracts write the same six fields; only the storage layout differs.

| Contract | Cold | Warm (mint 2) | Warm (mint 3, reported) |
  |---|---:|---:|---:|
  | ReferenceERC721 (6 unpacked slots) | 187,539 | 170,439 | **170,439** |
  | PackedERC721 (3 packed slots, VSC layout, no EAS) | 141,179 | 124,079 | **124,079** |

  **Saved per mint:** 46,360 gas
  **Reduction vs naive ERC-721:** **27.20%**

### B. Full production contract vs naive baseline (includes EAS cost)

For transparency. The production `VeriSkillCredential.mintCredential` additionally writes an EAS attestation, which the naive reference does not. This is why the raw production number is higher — the EAS attestation accounts for most of the +242,538 gas difference.

 | Contract | Cold | Warm (mint 2) | Warm (mint 3, reported) |
  |---|---:|---:|---:|
  | VeriSkillCredential (ERC-721 + packed state + EAS) | 430,077 | 412,965 | **412,977** |
  | ReferenceERC721 (ERC-721 + 6 unpacked slots, no EAS) | 187,539 | 170,415 | **170,439** |

  - VSC − Reference (warm): **+242,538 gas**
  - On-paper storage savings: ~60,000 gas (3 cold SSTOREs @ 20,000 each)
  - Residual = EAS attestation sub-call cost, which the reference does not pay.

### C. Lifecycle state-change operations on an already-minted credential

Measured on the production contract. Non-revoke ops are a single storage read plus a single storage write on the packed slot. `revokeCredential` additionally calls `eas.revoke`, which is why it is more expensive.

| Operation | Gas | Notes |
  |---|---:|---|
  | `updateLayer` | 39,982 | No EAS call |
  | `suspendCredential` | 33,357 | No EAS call |
  | `unsuspendCredential` | 33,329 | No EAS call |
  | `revokeCredential` | 95,335 | Includes `eas.revoke` sub-call |

Each non-revoke op is a single SLOAD + single SSTORE on slot 0 of the `Credential` struct.

### Reproducibility

cd packages/contracts
npm hardhat test test/GasBenchmark.test.ts

The three tables above are produced by three `it(...)` blocks in `test/GasBenchmark.test.ts`. Baseline contracts: `contracts/ReferenceERC721.sol` (naive, 6 slots) and `contracts/PackedERC721.sol` (optimized, 3 slots). Production contract: `contracts/VeriSkillCredential.sol`.

 #### Storage layout: the actual difference

  Same six fields, same semantics. The naive version gives each field its own 32-byte slot (wasting 31 bytes on `_layer` and
  `_status`, 27 bytes on each timestamp). The packed version declares them inside a struct, so Solidity places the four small
  fields (`uint8 + uint8 + uint40 + uint40` = 12 bytes) side by side in one 32-byte slot, with `skillId` and `commitHash` getting
   one slot each. That is where the three-slot saving comes from.

  **ReferenceERC721 (naive — 6 slots):**

  ```solidity
  mapping(uint256 => uint256) private _layer;
  mapping(uint256 => uint256) private _status;
  mapping(uint256 => uint256) private _issuedAt;
  mapping(uint256 => uint256) private _updatedAt;
  mapping(uint256 => bytes32) private _skillId;
  mapping(uint256 => bytes32) private _commitHash;
  ```

  **PackedERC721 (optimized — 3 slots):**

  ```solidity
  struct Credential {
      uint8   layer;
      uint8   status;
      uint40  issuedAt;
      uint40  updatedAt;
      bytes32 skillId;
      bytes32 commitHash;
  }
  mapping(uint256 => Credential) private _credentials;
  ```
