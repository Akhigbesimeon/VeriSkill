/// <reference types="mocha" />
import { expect } from 'chai'
import { ethers } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'
import type { ContractTransactionReceipt, Log } from 'ethers'
import {
  VeriSkillCredential__factory,
  VeriSkillResolver__factory,
  ReferenceERC721__factory,
  PackedERC721__factory,
  BaselineOZ721__factory,
  BlobERC721__factory,
  PackedERC721BadOrder__factory,
  EAS__factory,
  SchemaRegistry__factory,
} from '../typechain-types'

/**
 * FR02 — Gas benchmark.
 *
 * Panel feedback round 2: broaden beyond two contracts and one scenario.
 *
 * Contracts under test (all six storage layouts of the "ERC721 + metadata"
 * pattern that a real developer would reach for):
 *   1. ReferenceERC721        — naive, 6 unpacked uint256 mappings.
 *   2. BaselineOZ721          — plain OZ ERC721 + single struct mapping.
 *                               Tests both `mint` and `safeMint`.
 *   3. BlobERC721             — metadata ABI-encoded into one `bytes` blob.
 *   4. PackedERC721BadOrder   — struct with bad field order (5 slots).
 *   5. PackedERC721           — VSC-style packed struct (3 slots), no EAS.
 *   6. VeriSkillCredential    — production contract (3 slots + EAS attest).
 *
 * Scenarios per contract (where applicable):
 *   - cold vs warm mint
 *   - batch 1/10/50 (total gas, gas per mint)
 *   - new recipient vs recipient already holding a token
 *   - updateLayer 1→6 (production only), suspend, unsuspend, revoke
 *   - revert path: unauthorised caller, soulbound transfer attempt
 *
 * Output:
 *   - console markdown table
 *   - gas-results.json  (always written; not committed)
 *   - gas-baseline.json (regression target; UPDATE_GAS_BASELINE=1 to regen)
 *
 * Numbers are `receipt.gasUsed` from the Hardhat node. See
 * docs/GAS_BENCHMARK.md for methodology and limitations.
 */

const ISSUER_ROLE  = ethers.keccak256(ethers.toUtf8Bytes('ISSUER_ROLE'))
const UPDATER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('UPDATER_ROLE'))
const SCHEMA       = 'bytes32 skillId,bytes32 commitHash,uint8 layer,uint256 tokenId'

const RESULTS_FILE  = path.resolve(__dirname, '..', 'gas-results.json')
const BASELINE_FILE = path.resolve(__dirname, '..', 'gas-baseline.json')
const REGRESSION_TOLERANCE = 0.02 // 2%

function makeSkillId(name: string): string {
  return ethers.keccak256(ethers.solidityPackedKeccak256(['string', 'string'], [name, '1']))
}

function makeCommitHash(seed: number): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`commit-${seed}`))
}

async function gasOf(txPromise: Promise<any>): Promise<bigint> {
  const tx = await txPromise
  const receipt = (await tx.wait()) as ContractTransactionReceipt
  return receipt.gasUsed
}

async function gasOfRevert(send: () => Promise<any>): Promise<bigint> {
  // Hardhat's EDR provider rejects reverting txs at eth_sendTransaction time
  // when automine is on, so we never see a receipt. Turn automine off, let
  // the tx enter the mempool, mine manually, then fetch the receipt (status=0,
  // gasUsed populated). Restore automine at the end so nothing else breaks.
  await ethers.provider.send('evm_setAutomine', [false])
  try {
    const tx = await send()
    await ethers.provider.send('evm_mine', [])
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
    if (!receipt) throw new Error('no receipt after manual mine')
    return receipt.gasUsed
  } finally {
    await ethers.provider.send('evm_setAutomine', [true])
  }
}

function pct(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return 'n/a'
  const bps = (numerator * 10_000n) / denominator
  const whole = bps / 100n
  const frac = bps % 100n
  return `${whole}.${frac.toString().padStart(2, '0')}%`
}

function fmt(n: bigint | number | null | undefined): string {
  if (n == null) return '—'
  return typeof n === 'bigint' ? n.toLocaleString('en-US') : n.toLocaleString('en-US')
}

type Results = Record<string, Record<string, number>>
const results: Results = {}
function record(contract: string, scenario: string, gas: bigint): void {
  results[contract] ||= {}
  results[contract][scenario] = Number(gas)
}

async function deployProductionStack() {
  const [deployer, admin, issuer, developer] = await ethers.getSigners()
  const registry = await new SchemaRegistry__factory(deployer).deploy()
  await registry.waitForDeployment()
  const eas = await new EAS__factory(deployer).deploy(await registry.getAddress())
  await eas.waitForDeployment()
  const resolver = await new VeriSkillResolver__factory(deployer).deploy(
    await eas.getAddress(),
    admin.address,
  )
  await resolver.waitForDeployment()
  const regTx = await registry.register(SCHEMA, await resolver.getAddress(), true)
  const regReceipt = await regTx.wait()
  const regLog = regReceipt!.logs.find((l: Log) => {
    try { return registry.interface.parseLog(l as any)?.name === 'Registered' } catch { return false }
  })
  const schemaUid: string = registry.interface.parseLog(regLog as any)!.args.uid
  const credential = await new VeriSkillCredential__factory(deployer).deploy(
    admin.address,
    await eas.getAddress(),
    schemaUid,
  )
  await credential.waitForDeployment()
  await resolver.connect(admin).setAttester(await credential.getAddress())
  await credential.connect(admin).grantRole(ISSUER_ROLE, issuer.address)
  await credential.connect(admin).grantRole(UPDATER_ROLE, admin.address)
  return { credential, resolver, eas, admin, issuer, developer }
}

// ---------------------------------------------------------------------------
// Preserved original tests (so the figures quoted in the report still appear)
// ---------------------------------------------------------------------------

describe('FR02 — Gas benchmark: VeriSkillCredential vs ReferenceERC721', () => {

  it('reports per-mint gas and warm-slot delta', async function () {
    this.timeout(60_000)

    const { credential, issuer, developer } = await deployProductionStack()
    const [deployer] = await ethers.getSigners()
    const ref = await new ReferenceERC721__factory(deployer).deploy()
    await ref.waitForDeployment()

    const vscGas: bigint[] = []
    for (let i = 0; i < 3; i++) {
      vscGas.push(await gasOf(credential.connect(issuer)
        .mintCredential(developer.address, makeSkillId(`skill-${i}`), makeCommitHash(i), 4)))
    }
    const refGas: bigint[] = []
    for (let i = 0; i < 3; i++) {
      refGas.push(await gasOf(ref.mint(developer.address, makeSkillId(`ref-${i}`), makeCommitHash(100 + i), 4)))
    }

    record('VeriSkillCredential', 'mint_cold',  vscGas[0])
    record('VeriSkillCredential', 'mint_warm2', vscGas[1])
    record('VeriSkillCredential', 'mint_warm3', vscGas[2])
    record('ReferenceERC721',     'mint_cold',  refGas[0])
    record('ReferenceERC721',     'mint_warm2', refGas[1])
    record('ReferenceERC721',     'mint_warm3', refGas[2])

    const vscMinusRef = vscGas[2] - refGas[2]

    console.log(`
    ┌──────────────────────────────────────────────────────────────────────┐
    │ FR02 — Gas benchmark (warm mint, tokenId=3)                          │
    ├──────────────────────────────────────────────────────────────────────┤
    │ VeriSkillCredential.mintCredential (ERC721 + packed state + EAS):    │
    │   cold:  ${vscGas[0].toString().padStart(8)} gas                                     │
    │   warm2: ${vscGas[1].toString().padStart(8)} gas                                     │
    │   warm3: ${vscGas[2].toString().padStart(8)} gas  <- reported                        │
    │                                                                      │
    │ ReferenceERC721.mint (ERC721 + 6 unpacked state slots, no EAS):      │
    │   cold:  ${refGas[0].toString().padStart(8)} gas                                     │
    │   warm2: ${refGas[1].toString().padStart(8)} gas                                     │
    │   warm3: ${refGas[2].toString().padStart(8)} gas  <- reported                        │
    │                                                                      │
    │ VSC - Reference (warm):   ${(vscMinusRef >= 0n ? '+' : '') + vscMinusRef.toString()} gas                                │
    └──────────────────────────────────────────────────────────────────────┘`)

    expect(vscGas[0]).to.be.greaterThan(0n)
    expect(refGas[0]).to.be.greaterThan(0n)
    expect(vscGas[1]).to.be.lessThan(vscGas[0])
  })

  it('reports state-change gas for VeriSkillCredential (no EAS cost)', async function () {
    this.timeout(60_000)

    const { credential, admin, issuer, developer } = await deployProductionStack()

    await credential.connect(issuer).mintCredential(developer.address, makeSkillId('state-ops'), makeCommitHash(1), 4)

    const updateGas    = await gasOf(credential.connect(admin).updateLayer(1n, 5, makeCommitHash(2)))
    const suspendGas   = await gasOf(credential.connect(admin).suspendCredential(1n))
    const unsuspendGas = await gasOf(credential.connect(admin).unsuspendCredential(1n))

    await credential.connect(issuer).mintCredential(developer.address, makeSkillId('revoke-target'), makeCommitHash(99), 4)
    const revokeGas = await gasOf(credential.connect(admin).revokeCredential(2n))

    record('VeriSkillCredential', 'updateLayer',  updateGas)
    record('VeriSkillCredential', 'suspend',      suspendGas)
    record('VeriSkillCredential', 'unsuspend',    unsuspendGas)
    record('VeriSkillCredential', 'revoke',       revokeGas)

    console.log(`
    ┌──────────────────────────────────────────────────────────────────────┐
    │ FR02 — State-change ops on packed struct                             │
    ├──────────────────────────────────────────────────────────────────────┤
    │ updateLayer:        ${updateGas.toString().padStart(8)} gas  (no EAS)                   │
    │ suspendCredential:  ${suspendGas.toString().padStart(8)} gas  (no EAS)                   │
    │ unsuspendCredential:${unsuspendGas.toString().padStart(8)} gas  (no EAS)                   │
    │ revokeCredential:   ${revokeGas.toString().padStart(8)} gas  (incl. eas.revoke)          │
    └──────────────────────────────────────────────────────────────────────┘`)

    expect(updateGas).to.be.greaterThan(0n)
    expect(suspendGas).to.be.greaterThan(0n)
    expect(unsuspendGas).to.be.greaterThan(0n)
    expect(revokeGas).to.be.greaterThan(0n)
  })

  it('fair comparison: packed storage vs naive ERC-721 (same metadata, no EAS)', async function () {
    this.timeout(60_000)

    const [deployer, , , developer] = await ethers.getSigners()
    const ref    = await new ReferenceERC721__factory(deployer).deploy(); await ref.waitForDeployment()
    const packed = await new PackedERC721__factory(deployer).deploy();    await packed.waitForDeployment()

    const refGas: bigint[] = []; const packedGas: bigint[] = []
    for (let i = 0; i < 3; i++) {
      const skillId = makeSkillId(`fair-${i}`)
      const commit  = makeCommitHash(200 + i)
      refGas.push(await gasOf(ref.mint(developer.address, skillId, commit, 4)))
      packedGas.push(await gasOf(packed.mint(developer.address, skillId, commit, 4)))
    }

    record('PackedERC721', 'mint_cold',  packedGas[0])
    record('PackedERC721', 'mint_warm2', packedGas[1])
    record('PackedERC721', 'mint_warm3', packedGas[2])

    const saved   = refGas[2] - packedGas[2]
    const percent = pct(saved, refGas[2])

    console.log(`
    ┌──────────────────────────────────────────────────────────────────────┐
    │ FR02 — Apples-to-apples: packed vs naive (same metadata, no EAS)     │
    ├──────────────────────────────────────────────────────────────────────┤
    │ ReferenceERC721 (6 unpacked slots):                                  │
    │   cold:  ${refGas[0].toString().padStart(8)} gas                                     │
    │   warm3: ${refGas[2].toString().padStart(8)} gas  <- reported                        │
    │ PackedERC721 (3 packed slots, VSC-style layout, no EAS):             │
    │   cold:  ${packedGas[0].toString().padStart(8)} gas                                     │
    │   warm3: ${packedGas[2].toString().padStart(8)} gas  <- reported                        │
    │                                                                      │
    │ Saved per mint:              ${saved.toString().padStart(8)} gas                        │
    │ Reduction vs naive ERC-721:  ${percent.padEnd(8)}                            │
    └──────────────────────────────────────────────────────────────────────┘`)

    expect(packedGas[2]).to.be.lessThan(refGas[2])
  })
})

// ---------------------------------------------------------------------------
// Expanded benchmark: six contracts × many scenarios.
// ---------------------------------------------------------------------------

describe('FR02 — Expanded gas benchmark (six contracts, varied scenarios)', () => {

  it('runs the full matrix and writes gas-results.json', async function () {
    this.timeout(300_000)

    const [deployer, admin, issuer, developer, recipient2, randomCaller] = await ethers.getSigners()

    // --- Deploy every contract once ------------------------------------------
    const ref       = await new ReferenceERC721__factory(deployer).deploy();     await ref.waitForDeployment()
    const ozPlain   = await new BaselineOZ721__factory(deployer).deploy();       await ozPlain.waitForDeployment()
    const blob      = await new BlobERC721__factory(deployer).deploy();          await blob.waitForDeployment()
    const badPack   = await new PackedERC721BadOrder__factory(deployer).deploy();await badPack.waitForDeployment()
    const packed    = await new PackedERC721__factory(deployer).deploy();        await packed.waitForDeployment()
    const { credential } = await deployProductionStack()

    // Seed each contract with a mint so the "warm" numbers below are
    // measured on contract storage that has been touched before. This is
    // the honest steady-state cost.
    const seed = async (tag: string): Promise<void> => {
      const s = makeSkillId(`seed-${tag}-0`), c = makeCommitHash(0)
      await ref.mint(developer.address, s, c, 4)
      await ozPlain.mint(developer.address, s, c, 4)
      await blob.mint(developer.address, s, c, 4)
      await badPack.mint(developer.address, s, c, 4)
      await packed.mint(developer.address, s, c, 4)
      await credential.connect(issuer).mintCredential(developer.address, s, c, 4)
    }
    await seed('warm')

    // --- 1. cold (first mint of a token) vs steady-state warm mint -----------
    // The seed above already made the "cold" path warm. To measure a true
    // "cold" first-mint we need a fresh deployment of each, so we redeploy.
    const coldRef    = await new ReferenceERC721__factory(deployer).deploy();     await coldRef.waitForDeployment()
    const coldOz     = await new BaselineOZ721__factory(deployer).deploy();       await coldOz.waitForDeployment()
    const coldBlob   = await new BlobERC721__factory(deployer).deploy();          await coldBlob.waitForDeployment()
    const coldBad    = await new PackedERC721BadOrder__factory(deployer).deploy();await coldBad.waitForDeployment()
    const coldPack   = await new PackedERC721__factory(deployer).deploy();        await coldPack.waitForDeployment()
    const coldProd   = await deployProductionStack()

    const cold = {
      ReferenceERC721:     await gasOf(coldRef.mint(developer.address, makeSkillId('cold-ref'), makeCommitHash(1), 4)),
      BaselineOZ721:       await gasOf(coldOz.mint(developer.address, makeSkillId('cold-oz'), makeCommitHash(2), 4)),
      BlobERC721:          await gasOf(coldBlob.mint(developer.address, makeSkillId('cold-blob'), makeCommitHash(3), 4)),
      PackedERC721BadOrder:await gasOf(coldBad.mint(developer.address, makeSkillId('cold-bad'), makeCommitHash(4), 4)),
      PackedERC721:        await gasOf(coldPack.mint(developer.address, makeSkillId('cold-pack'), makeCommitHash(5), 4)),
      VeriSkillCredential: await gasOf(coldProd.credential.connect(coldProd.issuer)
        .mintCredential(coldProd.developer.address, makeSkillId('cold-vsc'), makeCommitHash(6), 4)),
    }

    // Two more mints on the seeded contracts → "warm" (steady-state).
    const warmRef    = await gasOf(ref.mint(developer.address, makeSkillId('warm-ref'), makeCommitHash(11), 4))
    const warmOz     = await gasOf(ozPlain.mint(developer.address, makeSkillId('warm-oz'), makeCommitHash(12), 4))
    const warmBlob   = await gasOf(blob.mint(developer.address, makeSkillId('warm-blob'), makeCommitHash(13), 4))
    const warmBad    = await gasOf(badPack.mint(developer.address, makeSkillId('warm-bad'), makeCommitHash(14), 4))
    const warmPack   = await gasOf(packed.mint(developer.address, makeSkillId('warm-pack'), makeCommitHash(15), 4))
    const warmProd   = await gasOf(credential.connect(issuer)
      .mintCredential(developer.address, makeSkillId('warm-vsc'), makeCommitHash(16), 4))

    const warm = {
      ReferenceERC721:      warmRef,
      BaselineOZ721:        warmOz,
      BlobERC721:           warmBlob,
      PackedERC721BadOrder: warmBad,
      PackedERC721:         warmPack,
      VeriSkillCredential:  warmProd,
    } as const

    for (const name of Object.keys(cold) as (keyof typeof cold)[]) {
      record(name, 'mint_cold', cold[name])
      record(name, 'mint_warm', warm[name])
    }

    // --- 2. safeMint vs mint (OZ baseline only, the receiver check cost) -----
    const ozSafe = await gasOf(ozPlain.safeMint(developer.address, makeSkillId('safe'), makeCommitHash(21), 4))
    record('BaselineOZ721', 'safeMint_warm', ozSafe)

    // --- 3. new recipient vs recipient already holding a token ---------------
    // developer already holds many tokens from seed+warm above. recipient2
    // holds none yet.
    const mintToNew = await gasOf(packed.mint(recipient2.address, makeSkillId('new'), makeCommitHash(31), 4))
    const mintToOld = await gasOf(packed.mint(developer.address, makeSkillId('old'), makeCommitHash(32), 4))
    record('PackedERC721', 'mint_recipient_new',     mintToNew)
    record('PackedERC721', 'mint_recipient_existing',mintToOld)

    const prodToNew = await gasOf(credential.connect(issuer)
      .mintCredential(recipient2.address, makeSkillId('vsc-new'), makeCommitHash(33), 4))
    const prodToOld = await gasOf(credential.connect(issuer)
      .mintCredential(developer.address, makeSkillId('vsc-old'), makeCommitHash(34), 4))
    record('VeriSkillCredential', 'mint_recipient_new',      prodToNew)
    record('VeriSkillCredential', 'mint_recipient_existing', prodToOld)

    // --- 4. batch mint: 1, 10, 50 (total and per-mint) ----------------------
    // Done as sequential individual txs on a fresh deployment of each
    // contract. The "per-mint" number is the mean of the batch.
    const runBatch = async (
      name: string,
      fresh: any,
      doMint: (i: number) => Promise<bigint>,
    ): Promise<void> => {
      for (const batchSize of [1, 10, 50]) {
        let total = 0n
        for (let i = 0; i < batchSize; i++) total += await doMint(i)
        record(name, `batch${batchSize}_total`,   total)
        record(name, `batch${batchSize}_perMint`, total / BigInt(batchSize))
      }
    }

    {
      const b = await new ReferenceERC721__factory(deployer).deploy(); await b.waitForDeployment()
      await runBatch('ReferenceERC721', b, i =>
        gasOf(b.mint(developer.address, makeSkillId(`b-ref-${i}`), makeCommitHash(1000 + i), 4)))
    }
    {
      const b = await new BaselineOZ721__factory(deployer).deploy(); await b.waitForDeployment()
      await runBatch('BaselineOZ721', b, i =>
        gasOf(b.mint(developer.address, makeSkillId(`b-oz-${i}`), makeCommitHash(2000 + i), 4)))
    }
    {
      const b = await new BlobERC721__factory(deployer).deploy(); await b.waitForDeployment()
      await runBatch('BlobERC721', b, i =>
        gasOf(b.mint(developer.address, makeSkillId(`b-blob-${i}`), makeCommitHash(3000 + i), 4)))
    }
    {
      const b = await new PackedERC721BadOrder__factory(deployer).deploy(); await b.waitForDeployment()
      await runBatch('PackedERC721BadOrder', b, i =>
        gasOf(b.mint(developer.address, makeSkillId(`b-bad-${i}`), makeCommitHash(4000 + i), 4)))
    }
    {
      const b = await new PackedERC721__factory(deployer).deploy(); await b.waitForDeployment()
      await runBatch('PackedERC721', b, i =>
        gasOf(b.mint(developer.address, makeSkillId(`b-pack-${i}`), makeCommitHash(5000 + i), 4)))
    }
    {
      const stack = await deployProductionStack()
      await runBatch('VeriSkillCredential', stack.credential, i =>
        gasOf(stack.credential.connect(stack.issuer)
          .mintCredential(stack.developer.address, makeSkillId(`b-vsc-${i}`), makeCommitHash(6000 + i), 4)))
    }

    // --- 5. production lifecycle: updateLayer 1→6, suspend, unsuspend, revoke
    const life = await deployProductionStack()
    // Mint at layer 1 so we can walk 1→6. Layer 1 is below MIN_LAYER_TO_MINT=4,
    // so we mint at layer 4 and walk 4→5→6 via updateLayer (which accepts any
    // layer ≥1), then separately show the full 1→6 walk after updating down.
    const tokenId = 1n
    await life.credential.connect(life.issuer)
      .mintCredential(life.developer.address, makeSkillId('life'), makeCommitHash(900), 4)

    // Drive the token down to layer 1 first so we can measure each step up.
    await life.credential.connect(life.admin).updateLayer(tokenId, 1, makeCommitHash(901))
    const step12 = await gasOf(life.credential.connect(life.admin).updateLayer(tokenId, 2, makeCommitHash(902)))
    const step23 = await gasOf(life.credential.connect(life.admin).updateLayer(tokenId, 3, makeCommitHash(903)))
    const step34 = await gasOf(life.credential.connect(life.admin).updateLayer(tokenId, 4, makeCommitHash(904)))
    const step45 = await gasOf(life.credential.connect(life.admin).updateLayer(tokenId, 5, makeCommitHash(905)))
    const step56 = await gasOf(life.credential.connect(life.admin).updateLayer(tokenId, 6, makeCommitHash(906)))

    const suspend2    = await gasOf(life.credential.connect(life.admin).suspendCredential(tokenId))
    const unsuspend2  = await gasOf(life.credential.connect(life.admin).unsuspendCredential(tokenId))
    // Mint a second token to revoke so the measured value is apples-to-apples
    // with the "cold revoke" cost on a token that has not been poked by
    // repeated updateLayer calls.
    await life.credential.connect(life.issuer)
      .mintCredential(life.developer.address, makeSkillId('life-revoke'), makeCommitHash(910), 4)
    const revoke2 = await gasOf(life.credential.connect(life.admin).revokeCredential(2n))

    record('VeriSkillCredential', 'updateLayer_1to2', step12)
    record('VeriSkillCredential', 'updateLayer_2to3', step23)
    record('VeriSkillCredential', 'updateLayer_3to4', step34)
    record('VeriSkillCredential', 'updateLayer_4to5', step45)
    record('VeriSkillCredential', 'updateLayer_5to6', step56)
    record('VeriSkillCredential', 'suspend_2',        suspend2)
    record('VeriSkillCredential', 'unsuspend_2',      unsuspend2)
    record('VeriSkillCredential', 'revoke_2',         revoke2)

    // --- 6. revert paths ----------------------------------------------------
    // 6a. Unauthorised caller mints → revert.
    const unauthMint = await gasOfRevert(() =>
      credential.connect(randomCaller).mintCredential(
        developer.address, makeSkillId('nope'), makeCommitHash(999), 4,
        { gasLimit: 500_000 },
      ),
    )
    record('VeriSkillCredential', 'revert_unauth_mint', unauthMint)

    // 6b. Soulbound transfer attempt → revert.
    // The developer owns tokenId=1 on the production `credential` (seed+warm).
    const soulbound = await gasOfRevert(() =>
      credential.connect(developer)
        .transferFrom(developer.address, recipient2.address, 1n, { gasLimit: 200_000 }),
    )
    record('VeriSkillCredential', 'revert_soulbound_transfer', soulbound)

    // Confirm the transfer really did revert (not just returned 0).
    expect(await credential.ownerOf(1n)).to.equal(developer.address)

    // --- Build output: markdown table + JSON --------------------------------
    const contractOrder = [
      'ReferenceERC721',
      'BaselineOZ721',
      'BlobERC721',
      'PackedERC721BadOrder',
      'PackedERC721',
      'VeriSkillCredential',
    ] as const

    const headlineRows = contractOrder.map(c => ({
      name:  c,
      cold:  results[c]?.mint_cold,
      warm:  results[c]?.mint_warm,
      b1:    results[c]?.batch1_perMint,
      b10:   results[c]?.batch10_perMint,
      b50:   results[c]?.batch50_perMint,
    }))

    const warmRefN = warm.ReferenceERC721
    const lines: string[] = []
    lines.push('')
    lines.push('| Contract | cold | warm | batch×1 | batch×10 | batch×50 | vs ReferenceERC721 (warm) |')
    lines.push('|---|---:|---:|---:|---:|---:|---:|')
    for (const r of headlineRows) {
      // `results` stores Number for JSON output; use the raw bigint map
      // (`warm`) for arithmetic to avoid mixing types.
      const warmGas = warm[r.name]
      const delta   = warmGas - warmRefN
      const sign    = delta >= 0n ? '+' : ''
      const relative = r.name === 'ReferenceERC721'
        ? 'baseline'
        : `${sign}${delta.toLocaleString('en-US')} (${pct(delta < 0n ? -delta : delta, warmRefN)})`
      lines.push(`| ${r.name} | ${fmt(r.cold)} | ${fmt(r.warm)} | ${fmt(r.b1)} | ${fmt(r.b10)} | ${fmt(r.b50)} | ${relative} |`)
    }
    lines.push('')
    lines.push('Lifecycle ops on VeriSkillCredential (warm storage):')
    lines.push('')
    lines.push('| Operation | Gas |')
    lines.push('|---|---:|')
    lines.push(`| updateLayer 1→2 | ${fmt(step12)} |`)
    lines.push(`| updateLayer 2→3 | ${fmt(step23)} |`)
    lines.push(`| updateLayer 3→4 | ${fmt(step34)} |`)
    lines.push(`| updateLayer 4→5 | ${fmt(step45)} |`)
    lines.push(`| updateLayer 5→6 | ${fmt(step56)} |`)
    lines.push(`| suspend | ${fmt(suspend2)} |`)
    lines.push(`| unsuspend | ${fmt(unsuspend2)} |`)
    lines.push(`| revoke (incl. eas.revoke) | ${fmt(revoke2)} |`)
    lines.push('')
    lines.push('Revert paths (gas spent before revert):')
    lines.push('')
    lines.push('| Scenario | Gas |')
    lines.push('|---|---:|')
    lines.push(`| mint by unauthorised caller | ${fmt(unauthMint)} |`)
    lines.push(`| soulbound transferFrom attempt | ${fmt(soulbound)} |`)
    lines.push('')

    console.log(lines.join('\n'))

    const output = {
      generatedAt: new Date().toISOString(),
      solc: {
        version: '0.8.29',
        optimizerRuns: 10000,
        viaIR: true,
        evmVersion: 'cancun',
      },
      // All numbers are gas (uint).
      contracts: results,
    }
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2) + '\n')

    // --- Regression guard ---------------------------------------------------
    if (process.env.UPDATE_GAS_BASELINE === '1') {
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(output, null, 2) + '\n')
      console.log(`[gas-baseline] wrote ${BASELINE_FILE}`)
    } else if (fs.existsSync(BASELINE_FILE)) {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
      const regressions: string[] = []
      for (const [contract, scenarios] of Object.entries(baseline.contracts as Results)) {
        for (const [scenario, baseGas] of Object.entries(scenarios)) {
          const now = results[contract]?.[scenario]
          if (now == null) {
            regressions.push(`${contract}/${scenario}: missing from current run`)
            continue
          }
          const ratio = now / baseGas
          if (ratio > 1 + REGRESSION_TOLERANCE) {
            regressions.push(
              `${contract}/${scenario}: ${now.toLocaleString()} vs baseline ${baseGas.toLocaleString()} (+${((ratio - 1) * 100).toFixed(2)}%)`,
            )
          }
        }
      }
      if (regressions.length > 0) {
        throw new Error(
          `Gas regression >${REGRESSION_TOLERANCE * 100}% vs gas-baseline.json:\n  - ` +
          regressions.join('\n  - ') +
          '\n\nIf this change is intentional, regenerate with:\n  UPDATE_GAS_BASELINE=1 npm run bench',
        )
      }
    } else {
      console.log('[gas-baseline] no gas-baseline.json yet — run with UPDATE_GAS_BASELINE=1 to create it')
    }

    expect(cold.PackedERC721).to.be.lessThan(cold.ReferenceERC721)
    expect(warm.PackedERC721).to.be.lessThan(warm.ReferenceERC721)
  })
})
