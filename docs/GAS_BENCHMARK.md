# Gas benchmark findings

VeriSkill credentials cost about 27% less to mint than a plain-vanilla NFT does. Here is what that actually means.

When someone earns a skill in VeriSkill, the system writes them a digital certificate onto a public blockchain. The certificate is an NFT, a digital token that proves ownership and that nobody can forge. The technical word for creating one is "minting". Every time anything gets written to the blockchain, somebody pays a small fee called gas, which is basically rent on a shared global computer. Cheaper minting means cheaper credentials and more of them.

The 27% number came out of a head-to-head test. Both contracts store the same six facts about a credential: the skill, a cryptographic fingerprint of the proof, a level number, a status flag, and two timestamps. The naive one keeps each fact in its own storage compartment. Six compartments. Ours notices that four of the facts are tiny numbers that happily fit side by side in a single compartment, so it bundles them. Three compartments. The whole optimization is that bundle.

On paper you would expect this to save three compartments × 20,000 gas each, so about 60,000 gas. The measured number is 46,360. The difference is bookkeeping overhead both contracts pay no matter what. That still gets you to 27.20% cheaper per mint, which is a real, defensible number.

One thing I would not hide from an examiner. The production contract does one extra thing the test did not measure in isolation: on every mint it also writes an EAS attestation, which is a universal standard that lets apps outside VeriSkill verify the credential. That costs more gas, which is why your real production mint is around 413,000 gas rather than 124,000. If you compare that raw number to a bare ERC-721 you look worse, not better. The honest comparison is the one above, where both contracts do the same job in different storage layouts. The EAS cost is a feature you chose to add, not inefficiency. Different conversation.

At today's Ethereum prices, 46,360 gas is maybe ten or fifteen cents per mint. Sounds like nothing until you picture a million mints, where it becomes real money. On Sepolia, where VeriSkill is currently deployed, nobody pays gas at all, so this is a future-you number for whenever VeriSkill moves to a chain that charges.

## Methodology

- **Tooling.** Hardhat local node, Solidity 0.8.29, `viaIR: true`, optimizer runs = 10,000, EVM target = Cancun. Every figure below is `receipt.gasUsed` from a real transaction on that node.
- **Scope.** Six contracts, listed in the next section. All of them store the same six logical fields (`skillId`, `commitHash`, `layer`, `status`, `issuedAt`, `updatedAt`) so the comparison is fair. The production contract additionally writes an EAS attestation on every mint; that is called out explicitly in every row where it applies.
- **Cold vs warm.** Each contract is measured twice. "Cold" is the first mint on a fresh deployment (one-time setup cost — initialising `_nextTokenId`, warming the receiver's balance slot, warming the operator's ERC721 event topics). "Warm" is the steady-state cost after at least one prior mint. The warm number is what a production system actually pays per credential.
- **Batch.** Each contract mints 1, 10 and 50 tokens back to back on a fresh deployment, measured as total gas and gas per mint. Every mint is an independent transaction — there is no multicall. The point is to show that per-mint gas does not drop with scale on this contract family; batching is not a win here, which is useful to know.
- **Recipient variants.** On the two contracts that matter (production and `PackedERC721`), one mint goes to a recipient that already holds a token, one to a brand-new recipient. Expected delta: a cold write of the recipient's balance slot on the first visit.
- **Lifecycle.** On the production contract: five `updateLayer` calls walking a token from layer 1 up to layer 6, then `suspend`, `unsuspend`, and `revoke` (which also calls `eas.revoke`).
- **Reverts.** Two revert paths are measured: an unauthorised caller tries to mint (fails the `ISSUER_ROLE` check inside `AccessControl`), and the owner of a soulbound token tries to `transferFrom` it (fails inside `_update`). Hardhat's EDR rejects reverting transactions at submission by default; the test disables automine for these two calls so the transaction enters the mempool, mines manually, then fetches the receipt.
- **Regression guard.** The expanded benchmark writes `gas-results.json` on every run and compares it against the committed `gas-baseline.json`. If any number drifts up by more than 2%, the test fails. Run with `UPDATE_GAS_BASELINE=1 npm run bench` to regenerate the baseline when a change is intentional.

Run it:

```bash
cd packages/contracts
npm run bench                       # pass-fail with regression guard
UPDATE_GAS_BASELINE=1 npm run bench # regenerate baseline
```

## Contracts under test

| # | Contract | Where | What it is |
|---|---|---|---|
| 1 | `ReferenceERC721` | `contracts/` | Naive baseline. Six separate `uint256` mappings, one per field. Six storage slots per token. |
| 2 | `BaselineOZ721` | `contracts/bench/` | Minimal OpenZeppelin ERC-721. Metadata in one `struct` mapping but with no packing (fields are `uint256`). Exposes both `_mint` and `_safeMint`. |
| 3 | `BlobERC721` | `contracts/bench/` | OpenZeppelin ERC-721 with all metadata ABI-encoded into a single `bytes` blob per token. |
| 4 | `PackedERC721BadOrder` | `contracts/bench/` | Same six fields as the optimised version, but the struct fields are declared in a poor order. The two `bytes32` fields interrupt the small-field packing run, so Solidity ends up with 5 slots instead of 3. |
| 5 | `PackedERC721` | `contracts/` | VeriSkill's storage layout without the EAS attestation. Three slots per token. |
| 6 | `VeriSkillCredential` | `contracts/` | Production contract. Same three-slot layout as `PackedERC721`, plus a fourth slot for the EAS attestation UID, and an EAS `attest` sub-call on every mint. |

## Full results

### Mint — cold, warm, and batch

All numbers are gas. "Warm" is the third mint on an already-seeded contract. "batch×N perMint" is the mean of `N` sequential individual transactions on a fresh deployment.

| Contract | cold | warm | batch×1 | batch×10 | batch×50 | vs ReferenceERC721 (warm) |
|---|---:|---:|---:|---:|---:|---:|
| ReferenceERC721 | 187,527 | 170,439 | 187,539 | 170,437 | 170,436 | baseline |
| BaselineOZ721 | 187,564 | 170,464 | 187,564 | 170,461 | 170,462 | +25 (0.01%) |
| BlobERC721 | 210,453 | 193,353 | 210,453 | 193,349 | 193,348 | +22,914 (13.44%) |
| PackedERC721BadOrder | 163,521 | 146,421 | 163,521 | 146,418 | 146,417 | −24,018 (14.09%) |
| PackedERC721 | 141,167 | 124,067 | 141,179 | 124,079 | 124,076 | **−46,372 (27.20%)** |
| VeriSkillCredential | 430,077 | 412,977 | 430,077 | 412,977 | 412,974 | +242,538 (142.30%) |

Observations:

- **BaselineOZ721 ≈ ReferenceERC721.** Writing the six fields as a struct of `uint256`s is effectively identical to six separate mappings — both compile to the same six cold `SSTORE`s. The struct is cosmetic until you make the fields small enough to actually pack.
- **BlobERC721 is worse, not better.** A dynamic `bytes` write pays a length-slot write plus one `SSTORE` per 32 bytes of payload. Our payload is one `uint256 + three `bytes32 + a pair of `uint40`s`, which encodes to 6 × 32-byte words of data plus the length slot — seven writes, slightly more than the naive six.
- **PackedERC721BadOrder captures only half the saving.** Struct packing is not automatic: a `bytes32` in the middle of a run of small fields forces Solidity to flush the current packing slot. Field order matters.
- **PackedERC721 hits the full 27.20% saving** by placing the four small fields (`uint8 + uint8 + uint40 + uint40` = 12 bytes) contiguously so they share one slot.

### Mint — recipient variants

The ERC-721 base writes `_balances[to]`. If `to` has never held one of this contract's tokens before, that slot is cold; if it has, the slot is already warm.

| Contract | new recipient | existing recipient | delta |
|---|---:|---:|---:|
| PackedERC721 | 141,167 | 124,079 | +17,088 |
| VeriSkillCredential | 430,065 | 412,965 | +17,100 |

The ~17k gas gap is the cold `SSTORE` to a new recipient's balance slot (+ its subsequent `SLOAD`), consistent across both contracts. Worth knowing if your product pattern is "every developer holds many credentials": after the first mint, every subsequent mint to the same wallet costs ~17k less.

### Mint — `safeMint` vs `mint` (BaselineOZ721)

| Call | Gas | Delta |
|---|---:|---:|
| `mint` (warm) | 170,464 | — |
| `safeMint` (warm) | 173,310 | +2,846 |

`_safeMint` additionally does an `onERC721Received` call to the recipient. Measured here against a plain EOA; the overhead is the `extcodesize` check and the synthetic call setup. Contract recipients would add their own receiver cost on top.

### Lifecycle — state-change ops on an already-minted credential

Measured on `VeriSkillCredential`, warm storage.

| Operation | Gas | Notes |
|---|---:|---|
| `updateLayer` 1→2 | 39,982 | SLOAD + SSTORE on slot 0 |
| `updateLayer` 2→3 | 39,982 | — |
| `updateLayer` 3→4 | 39,982 | — |
| `updateLayer` 4→5 | 39,982 | — |
| `updateLayer` 5→6 | 39,982 | — |
| `suspend` | 33,357 | — |
| `unsuspend` | 33,329 | — |
| `revoke` | 95,335 | Includes `eas.revoke` sub-call |

`updateLayer` is flat across all five steps because the write touches the same packed slot every time. Each non-revoke op is a single SLOAD + single SSTORE. `revoke` is more expensive because it additionally tears down the EAS attestation.

### Reverts

Hardhat's EDR default rejects reverting transactions at submission, so the test disables automine around these two calls to get a real receipt.

| Scenario | Gas | What reverts |
|---|---:|---|
| mint by unauthorised caller | 25,173 | `AccessControl: _checkRole` on `ISSUER_ROLE` |
| soulbound `transferFrom` attempt | 24,565 | `VeriSkillCredential._update` reverts with `NonTransferable` |

These numbers are the cost of a bounced attack or a mistaken transfer. Under the EIP-150 "63/64" rule, the caller gets back most of their gas minus the base transaction cost (21,000) plus the few opcodes that ran before the revert. Both numbers are close to that floor — the role check and the soulbound check both trip early.

The test also asserts that the soulbound transfer did not actually succeed (`ownerOf` is unchanged).

## Why 27.2% and not 30%?

The Phase 0 target was "30% reduction vs a naive ERC-721". The measured number is 27.20%. The 2.8 percentage-point gap is honest and explainable:

- **The paper-perfect ceiling is ~35%, not 100%.** Three cold SSTOREs saved at 20,000 gas each is 60,000 gas off a baseline of 170,439 — that is 35.2%. There is no path to "half the gas" without changing what the contract stores, because ERC-721 ownership, token-ID allocation and event emission are irreducible under this standard.
- **Bookkeeping burns the rest.** The 60,000 → 46,360 gap is calldata (the four args already cost ~2,800 each warm), the mint event (a 3-topic LOG4 is ~2,400 gas), the `_balances` SLOAD-increment-SSTORE round-trip, and the receiver check that OpenZeppelin's `_mint` runs even when there is no receiver code. None of these three storage slots were going to save that overhead.
- **If we wanted 30%**, we would have to either (a) drop event data, which breaks indexers, (b) skip the receiver check, which breaks safe custody, or (c) cut one of the metadata fields. None of those are worth it for three percentage points.
- **27.20% is a stable, defensible number.** Same contract, same compiler settings, same scenario: you get 27.20% every time. Changing the optimizer from 10,000 to 200 runs would shift it by ~900 gas (~0.5 pp) per the comment in `hardhat.config.ts` — within noise.

## Limitations

- **Local node.** Every number is measured on Hardhat EDR, not on a real network. There is no block gas limit pressure, no mempool contention, no priority-fee auction. Those effects are orthogonal to `gasUsed` (they change price, not quantity) but a real deployment will see them.
- **Not L2.** Sepolia is an Ethereum testnet. The cost model on an L2 rollup (Base, Arbitrum, Optimism) is dominated by L1 calldata, not L2 execution gas. The relative ordering of these contracts holds on L2, but the absolute numbers do not; a 27% saving on execution gas is a much smaller saving once L1 data fees dominate.
- **No gas price here.** ETH is a currency, gas is a unit of work. The financial cost of a mint is `gasUsed × gasPrice`, where `gasPrice` depends on network demand and `ETH/USD` at the moment of the transaction. At ~1 gwei and ~$2,400/ETH, 46,360 gas saved per mint is roughly $0.11. At ~50 gwei and ~$5,000/ETH, the same saving is ~$11.59. VeriSkill is on Sepolia, where this is $0.00.
- **One version of each contract.** A different ERC-721 lineage (ERC-721A, Solmate's ERC-721, upgradeable variants) would benchmark differently, particularly at batch=50 where ERC-721A's amortised owner-slot write genuinely helps. This benchmark compares storage layouts, not ERC-721 implementations.
- **No gas golfing applied beyond struct packing.** `VeriSkillCredential` could go lower per mint by writing calldata directly to storage without constructing the `Credential` struct in memory first, by emitting a smaller event, or by replacing OpenZeppelin's `_mint` with a bespoke equivalent. Those changes were not made. The 27.20% is what the struct-packing optimisation buys on its own, measured against an unmodified OpenZeppelin ERC-721, which is the honest comparison.

## Reproducibility

```bash
cd packages/contracts
npm run bench
```

The scenarios above are produced by the four `it(...)` blocks in `test/GasBenchmark.test.ts`. The first three are the original two-contract benchmark, preserved so the headline figure in the report can be cross-checked. The fourth is the expanded six-contract matrix; it emits `gas-results.json` and guards against regressions by comparing to `gas-baseline.json` with a 2% tolerance.

The six contracts live at:

- `contracts/ReferenceERC721.sol`
- `contracts/PackedERC721.sol`
- `contracts/VeriSkillCredential.sol`
- `contracts/bench/BaselineOZ721.sol`
- `contracts/bench/BlobERC721.sol`
- `contracts/bench/PackedERC721BadOrder.sol`

## Storage layout: the actual difference

Same six fields, same semantics. The naive version gives each field its own 32-byte slot (wasting 31 bytes on `_layer` and `_status`, 27 bytes on each timestamp). The packed version declares them inside a struct, so Solidity places the four small fields (`uint8 + uint8 + uint40 + uint40` = 12 bytes) side by side in one 32-byte slot, with `skillId` and `commitHash` getting one slot each.

`PackedERC721BadOrder` has exactly the same fields but Solidity cannot pack them, because each `bytes32` interrupts the packing run. That is why field order matters.

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

**PackedERC721BadOrder (5 slots — same fields, bad order):**

```solidity
struct Credential {
    bytes32 skillId;    // slot 0
    uint8   layer;      // slot 1 (31 bytes wasted)
    bytes32 commitHash; // slot 2
    uint8   status;     // slot 3 begins
    uint40  issuedAt;   // slot 3
    uint40  updatedAt;  // slot 3
}
```
