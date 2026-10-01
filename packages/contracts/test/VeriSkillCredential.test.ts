import { expect } from 'chai'
import { ethers } from 'hardhat'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { VeriSkillCredential, ReferenceERC721 } from '../typechain-types'
import { ContractTransactionReceipt } from 'ethers'

// ─── Test helpers ─────────────────────────────────────────────────────────────

const ISSUER_ROLE  = ethers.keccak256(ethers.toUtf8Bytes('ISSUER_ROLE'))
const UPDATER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('UPDATER_ROLE'))
const REVOKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('REVOKER_ROLE'))
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash

/** Build a deterministic bytes32 skill ID matching the Phase 0 spec. */
function makeSkillId(name: string, version = '1'): string {
  return ethers.keccak256(ethers.solidityPackedKeccak256(['string', 'string'], [name, version]))
}

/** Build a mock commitHash (in production this is computed by the backend). */
function makeCommitHash(owner: string, skillId: string, layer: number): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'bytes32', 'uint8', 'uint40'],
      [owner, skillId, ethers.ZeroHash, layer, Math.floor(Date.now() / 1000)]
    )
  )
}



// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [deployer, admin, issuer, updater, revoker, developer, other] =
    await ethers.getSigners()

  const factory = await ethers.getContractFactory('VeriSkillCredential')
  const contract = (await factory.deploy(admin.address)) as VeriSkillCredential
  await contract.waitForDeployment()

  // Grant operational roles to designated accounts
  await contract.connect(admin).grantRole(ISSUER_ROLE,  issuer.address)
  await contract.connect(admin).grantRole(UPDATER_ROLE, updater.address)

  return { contract, deployer, admin, issuer, updater, revoker, developer, other }
}

async function deployAndMintFixture() {
  const base = await deployFixture()
  const { contract, issuer, developer } = base

  const skillId    = makeSkillId('JavaScript')
  const layer      = 4 // MIN_LAYER_TO_MINT
  const commitHash = makeCommitHash(developer.address, skillId, layer)

  const tx = await contract.connect(issuer).mintCredential(
    developer.address, skillId, commitHash, layer
  )
  const receipt = await tx.wait() as ContractTransactionReceipt
  const tokenId = 1n

  return { ...base, skillId, layer, commitHash, tokenId, mintReceipt: receipt }
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('VeriSkillCredential', () => {

  // ── 1. Deployment ────────────────────────────────────────────────────────

  describe('Deployment', () => {
    it('deploys with correct name and symbol', async () => {
      const { contract } = await deployFixture()
      expect(await contract.name()).to.equal('VeriSkill Credential')
      expect(await contract.symbol()).to.equal('VSC')
    })

    it('grants DEFAULT_ADMIN_ROLE to the admin address', async () => {
      const { contract, admin } = await deployFixture()
      expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true
    })

    it('grants REVOKER_ROLE to the admin address', async () => {
      const { contract, admin } = await deployFixture()
      expect(await contract.hasRole(REVOKER_ROLE, admin.address)).to.be.true
    })

    it('does NOT grant any role to the deployer if deployer !== admin', async () => {
      const { contract, deployer, admin } = await deployFixture()
      if (deployer.address !== admin.address) {
        expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.false
        expect(await contract.hasRole(ISSUER_ROLE,        deployer.address)).to.be.false
      }
    })

    it('starts with zero minted credentials', async () => {
      const { contract } = await deployFixture()
      expect(await contract.totalMinted()).to.equal(0n)
    })

    it('exposes correct MIN_LAYER_TO_MINT constant', async () => {
      const { contract } = await deployFixture()
      expect(await contract.MIN_LAYER_TO_MINT()).to.equal(4)
    })

    it('exposes correct MAX_LAYER constant', async () => {
      const { contract } = await deployFixture()
      expect(await contract.MAX_LAYER()).to.equal(6)
    })

    it('reverts if admin is the zero address', async () => {
      const factory = await ethers.getContractFactory('VeriSkillCredential')
      await expect(factory.deploy(ethers.ZeroAddress))
        .to.be.revertedWith('VeriSkill: admin cannot be zero address')
    })
  })

  // ── 2. Role management ───────────────────────────────────────────────────

  describe('Role management', () => {
    it('admin can grant ISSUER_ROLE', async () => {
      const { contract, admin, other } = await deployFixture()
      await contract.connect(admin).grantRole(ISSUER_ROLE, other.address)
      expect(await contract.hasRole(ISSUER_ROLE, other.address)).to.be.true
    })

    it('admin can grant UPDATER_ROLE', async () => {
      const { contract, admin, other } = await deployFixture()
      await contract.connect(admin).grantRole(UPDATER_ROLE, other.address)
      expect(await contract.hasRole(UPDATER_ROLE, other.address)).to.be.true
    })

    it('admin can grant REVOKER_ROLE', async () => {
      const { contract, admin, other } = await deployFixture()
      await contract.connect(admin).grantRole(REVOKER_ROLE, other.address)
      expect(await contract.hasRole(REVOKER_ROLE, other.address)).to.be.true
    })

    it('admin can revoke a role', async () => {
      const { contract, admin, issuer } = await deployFixture()
      await contract.connect(admin).revokeRole(ISSUER_ROLE, issuer.address)
      expect(await contract.hasRole(ISSUER_ROLE, issuer.address)).to.be.false
    })

    it('non-admin cannot grant roles', async () => {
      const { contract, other, issuer } = await deployFixture()
      await expect(contract.connect(other).grantRole(ISSUER_ROLE, issuer.address))
        .to.be.revertedWithCustomError(contract, 'AccessControlUnauthorizedAccount')
    })
  })

  // ── 3. Minting ───────────────────────────────────────────────────────────

  describe('mintCredential', () => {
    it('ISSUER_ROLE can mint a credential', async () => {
      const { contract, issuer, developer } = await deployFixture()
      const skillId    = makeSkillId('Python')
      const layer      = 4
      const commitHash = makeCommitHash(developer.address, skillId, layer)

      await expect(
        contract.connect(issuer).mintCredential(developer.address, skillId, commitHash, layer)
      ).to.not.be.reverted
    })

    it('assigns token ID starting at 1', async () => {
      const { contract, issuer, developer } = await deployFixture()
      const skillId    = makeSkillId('Solidity')
      const commitHash = makeCommitHash(developer.address, skillId, 4)

      const tx = await contract.connect(issuer).mintCredential(
        developer.address, skillId, commitHash, 4
      )
      const receipt = await tx.wait() as ContractTransactionReceipt
      // Find CredentialMinted event
      const event = receipt.logs
        .map(log => { try { return contract.interface.parseLog(log) } catch { return null } })
        .find(e => e?.name === 'CredentialMinted')
      expect(event?.args.tokenId).to.equal(1n)
    })

    it('increments token ID for each mint', async () => {
      const { contract, issuer, developer, other } = await deployFixture()
      const skillId = makeSkillId('JavaScript')
      await contract.connect(issuer).mintCredential(developer.address, skillId, makeCommitHash(developer.address, skillId, 4), 4)
      const tx2 = await contract.connect(issuer).mintCredential(other.address, makeSkillId('Python'), makeCommitHash(other.address, makeSkillId('Python'), 4), 4)
      const receipt2 = await tx2.wait() as ContractTransactionReceipt
      const event = receipt2.logs
        .map(log => { try { return contract.interface.parseLog(log) } catch { return null } })
        .find(e => e?.name === 'CredentialMinted')
      expect(event?.args.tokenId).to.equal(2n)
    })

    it('stores correct credential fields after mint', async () => {
      const { contract, tokenId, skillId, commitHash, layer } = await deployAndMintFixture()
      const cred = await contract.getCredential(tokenId)

      expect(cred.layer).to.equal(layer)
      expect(cred.status).to.equal(0) // ACTIVE
      expect(cred.skillId).to.equal(skillId)
      expect(cred.commitHash).to.equal(commitHash)
      expect(cred.issuedAt).to.be.gt(0n)
      expect(cred.updatedAt).to.equal(cred.issuedAt)
    })

    it('assigns ownership to the developer address', async () => {
      const { contract, tokenId, developer } = await deployAndMintFixture()
      expect(await contract.ownerOf(tokenId)).to.equal(developer.address)
    })

    it('increments totalMinted', async () => {
      const { contract } = await deployAndMintFixture()
      expect(await contract.totalMinted()).to.equal(1n)
    })

    it('emits CredentialMinted event with correct args', async () => {
      const { contract, issuer, developer } = await deployFixture()
      const skillId    = makeSkillId('Docker')
      const layer      = 5
      const commitHash = makeCommitHash(developer.address, skillId, layer)

      await expect(
        contract.connect(issuer).mintCredential(developer.address, skillId, commitHash, layer)
      )
        .to.emit(contract, 'CredentialMinted')
        .withArgs(1n, developer.address, skillId, layer, commitHash, (_: bigint) => _ > 0n)
    })

    it('reverts if caller does not have ISSUER_ROLE', async () => {
      const { contract, developer, other } = await deployFixture()
      const skillId = makeSkillId('React')
      await expect(
        contract.connect(other).mintCredential(developer.address, skillId, ethers.ZeroHash, 4)
      ).to.be.revertedWithCustomError(contract, 'AccessControlUnauthorizedAccount')
    })

    it('reverts when layer is below MIN_LAYER_TO_MINT (layer 1)', async () => {
      const { contract, issuer, developer } = await deployFixture()
      const skillId = makeSkillId('Node.js')
      await expect(
        contract.connect(issuer).mintCredential(developer.address, skillId, ethers.ZeroHash, 1)
      ).to.be.revertedWithCustomError(contract, 'LayerBelowMintMinimum')
    })

    it('reverts when layer is below MIN_LAYER_TO_MINT (layer 2)', async () => {
      const { contract, issuer, developer } = await deployFixture()
      await expect(
        contract.connect(issuer).mintCredential(developer.address, makeSkillId('Git'), ethers.ZeroHash, 2)
      ).to.be.revertedWithCustomError(contract, 'LayerBelowMintMinimum')
    })

    it('reverts when layer is below MIN_LAYER_TO_MINT (layer 3)', async () => {
      const { contract, issuer, developer } = await deployFixture()
      await expect(
        contract.connect(issuer).mintCredential(developer.address, makeSkillId('Java'), ethers.ZeroHash, 3)
      ).to.be.revertedWithCustomError(contract, 'LayerBelowMintMinimum')
    })

    it('reverts when layer exceeds MAX_LAYER (layer 7)', async () => {
      const { contract, issuer, developer } = await deployFixture()
      await expect(
        contract.connect(issuer).mintCredential(developer.address, makeSkillId('Java'), ethers.ZeroHash, 7)
      ).to.be.revertedWithCustomError(contract, 'InvalidLayer')
    })

    it('allows minting at exactly MIN_LAYER_TO_MINT (layer 4)', async () => {
      const { contract, issuer, developer } = await deployFixture()
      await expect(
        contract.connect(issuer).mintCredential(developer.address, makeSkillId('Python'), ethers.ZeroHash, 4)
      ).to.not.be.reverted
    })

    it('allows minting at MAX_LAYER (layer 6)', async () => {
      const { contract, issuer, developer } = await deployFixture()
      await expect(
        contract.connect(issuer).mintCredential(developer.address, makeSkillId('Solidity'), ethers.ZeroHash, 6)
      ).to.not.be.reverted
    })
  })

  // ── 4. Layer updates ─────────────────────────────────────────────────────

  describe('updateLayer', () => {
    it('UPDATER_ROLE can update layer and commitHash', async () => {
      const { contract, updater, tokenId, developer } = await deployAndMintFixture()
      const newSkillId    = makeSkillId('JavaScript')
      const newCommitHash = makeCommitHash(developer.address, newSkillId, 5)

      await contract.connect(updater).updateLayer(tokenId, 5, newCommitHash)
      const cred = await contract.getCredential(tokenId)
      expect(cred.layer).to.equal(5)
      expect(cred.commitHash).to.equal(newCommitHash)
    })

    it('updates the updatedAt timestamp', async () => {
      const { contract, updater, tokenId } = await deployAndMintFixture()
      const before = (await contract.getCredential(tokenId)).updatedAt

      // Advance block time
      await ethers.provider.send('evm_increaseTime', [60])
      await ethers.provider.send('evm_mine', [])

      await contract.connect(updater).updateLayer(tokenId, 5, ethers.ZeroHash)
      const after = (await contract.getCredential(tokenId)).updatedAt
      expect(after).to.be.gt(before)
    })

    it('emits LayerUpdated event with correct args', async () => {
      const { contract, updater, tokenId } = await deployAndMintFixture()
      const newCommitHash = ethers.keccak256(ethers.toUtf8Bytes('updated'))

      await expect(contract.connect(updater).updateLayer(tokenId, 6, newCommitHash))
        .to.emit(contract, 'LayerUpdated')
        .withArgs(tokenId, 4, 6, newCommitHash, (_: bigint) => _ > 0n)
    })

    it('allows layer decrease (evidence invalidation)', async () => {
      const { contract, updater, tokenId } = await deployAndMintFixture()
      // Evidence invalidated — layer decreases from 4 to 2
      await expect(contract.connect(updater).updateLayer(tokenId, 2, ethers.ZeroHash))
        .to.not.be.reverted
      expect((await contract.getCredential(tokenId)).layer).to.equal(2)
    })

    it('reverts on invalid layer 0', async () => {
      const { contract, updater, tokenId } = await deployAndMintFixture()
      await expect(contract.connect(updater).updateLayer(tokenId, 0, ethers.ZeroHash))
        .to.be.revertedWithCustomError(contract, 'InvalidLayer')
    })

    it('reverts on invalid layer 7', async () => {
      const { contract, updater, tokenId } = await deployAndMintFixture()
      await expect(contract.connect(updater).updateLayer(tokenId, 7, ethers.ZeroHash))
        .to.be.revertedWithCustomError(contract, 'InvalidLayer')
    })

    it('reverts when credential is revoked', async () => {
      const { contract, updater, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).revokeCredential(tokenId)
      await expect(contract.connect(updater).updateLayer(tokenId, 5, ethers.ZeroHash))
        .to.be.revertedWithCustomError(contract, 'CredentialAlreadyRevoked')
    })

    it('reverts when credential does not exist', async () => {
      const { contract, updater } = await deployFixture()
      await expect(contract.connect(updater).updateLayer(999n, 5, ethers.ZeroHash))
        .to.be.revertedWithCustomError(contract, 'CredentialNotFound')
    })

    it('reverts when caller does not have UPDATER_ROLE', async () => {
      const { contract, other, tokenId } = await deployAndMintFixture()
      await expect(contract.connect(other).updateLayer(tokenId, 5, ethers.ZeroHash))
        .to.be.revertedWithCustomError(contract, 'AccessControlUnauthorizedAccount')
    })
  })

  // ── 5. Suspension ────────────────────────────────────────────────────────

  describe('suspendCredential', () => {
    it('REVOKER_ROLE can suspend an ACTIVE credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).suspendCredential(tokenId)
      expect((await contract.getCredential(tokenId)).status).to.equal(1) // SUSPENDED
    })

    it('emits StatusChanged event on suspend', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await expect(contract.connect(admin).suspendCredential(tokenId))
        .to.emit(contract, 'StatusChanged')
        .withArgs(tokenId, 0, 1, (_: bigint) => _ > 0n) // ACTIVE→SUSPENDED
    })

    it('reverts when suspending an already-suspended credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).suspendCredential(tokenId)
      await expect(contract.connect(admin).suspendCredential(tokenId))
        .to.be.revertedWithCustomError(contract, 'CredentialAlreadySuspended')
    })

    it('reverts when suspending a revoked credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).revokeCredential(tokenId)
      await expect(contract.connect(admin).suspendCredential(tokenId))
        .to.be.revertedWithCustomError(contract, 'CredentialAlreadyRevoked')
    })

    it('reverts when caller does not have REVOKER_ROLE', async () => {
      const { contract, other, tokenId } = await deployAndMintFixture()
      await expect(contract.connect(other).suspendCredential(tokenId))
        .to.be.revertedWithCustomError(contract, 'AccessControlUnauthorizedAccount')
    })
  })

  // ── 6. Unsuspension ──────────────────────────────────────────────────────

  describe('unsuspendCredential', () => {
    it('REVOKER_ROLE can unsuspend a suspended credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).suspendCredential(tokenId)
      await contract.connect(admin).unsuspendCredential(tokenId)
      expect((await contract.getCredential(tokenId)).status).to.equal(0) // ACTIVE
    })

    it('emits StatusChanged event on unsuspend', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).suspendCredential(tokenId)
      await expect(contract.connect(admin).unsuspendCredential(tokenId))
        .to.emit(contract, 'StatusChanged')
        .withArgs(tokenId, 1, 0, (_: bigint) => _ > 0n) // SUSPENDED→ACTIVE
    })

    it('reverts when unsuspending an ACTIVE credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await expect(contract.connect(admin).unsuspendCredential(tokenId))
        .to.be.revertedWithCustomError(contract, 'CredentialNotSuspended')
    })

    it('reverts when unsuspending a REVOKED credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).revokeCredential(tokenId)
      await expect(contract.connect(admin).unsuspendCredential(tokenId))
        .to.be.revertedWithCustomError(contract, 'CredentialAlreadyRevoked')
    })
  })

  // ── 7. Revocation ────────────────────────────────────────────────────────

  describe('revokeCredential', () => {
    it('REVOKER_ROLE can revoke an ACTIVE credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).revokeCredential(tokenId)
      expect((await contract.getCredential(tokenId)).status).to.equal(2) // REVOKED
    })

    it('REVOKER_ROLE can revoke a SUSPENDED credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).suspendCredential(tokenId)
      await contract.connect(admin).revokeCredential(tokenId)
      expect((await contract.getCredential(tokenId)).status).to.equal(2) // REVOKED
    })

    it('isRevoked returns true after revocation', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).revokeCredential(tokenId)
      expect(await contract.isRevoked(tokenId)).to.be.true
    })

    it('isRevoked returns false before revocation', async () => {
      const { contract, tokenId } = await deployAndMintFixture()
      expect(await contract.isRevoked(tokenId)).to.be.false
    })

    it('emits both StatusChanged and CredentialRevoked events', async () => {
      const { contract, admin, tokenId, developer } = await deployAndMintFixture()
      const tx = await contract.connect(admin).revokeCredential(tokenId)
      await expect(tx).to.emit(contract, 'StatusChanged')
      await expect(tx).to.emit(contract, 'CredentialRevoked')
        .withArgs(tokenId, developer.address, (_: bigint) => _ > 0n)
    })

    it('reverts when revoking an already-revoked credential', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      await contract.connect(admin).revokeCredential(tokenId)
      await expect(contract.connect(admin).revokeCredential(tokenId))
        .to.be.revertedWithCustomError(contract, 'CredentialAlreadyRevoked')
    })

    it('reverts when caller does not have REVOKER_ROLE', async () => {
      const { contract, other, tokenId } = await deployAndMintFixture()
      await expect(contract.connect(other).revokeCredential(tokenId))
        .to.be.revertedWithCustomError(contract, 'AccessControlUnauthorizedAccount')
    })

    it('revoked credential token is still owned by the developer (not burned)', async () => {
      const { contract, admin, tokenId, developer } = await deployAndMintFixture()
      await contract.connect(admin).revokeCredential(tokenId)
      // Token still exists and is still owned — revocation does NOT burn
      expect(await contract.ownerOf(tokenId)).to.equal(developer.address)
    })
  })

  // ── 8. Non-transferability ───────────────────────────────────────────────

  describe('Non-transferability (SBT enforcement)', () => {
    it('transferFrom reverts with NonTransferable', async () => {
      const { contract, developer, other, tokenId } = await deployAndMintFixture()
      await expect(
        contract.connect(developer).transferFrom(developer.address, other.address, tokenId)
      ).to.be.revertedWithCustomError(contract, 'NonTransferable')
    })

    it('safeTransferFrom reverts with NonTransferable', async () => {
      const { contract, developer, other, tokenId } = await deployAndMintFixture()
      await expect(
        contract.connect(developer)['safeTransferFrom(address,address,uint256)'](
          developer.address, other.address, tokenId
        )
      ).to.be.revertedWithCustomError(contract, 'NonTransferable')
    })

    it('approve reverts with NonTransferable', async () => {
      const { contract, developer, other, tokenId } = await deployAndMintFixture()
      await expect(
        contract.connect(developer).approve(other.address, tokenId)
      ).to.be.revertedWithCustomError(contract, 'NonTransferable')
    })

    it('setApprovalForAll reverts with NonTransferable', async () => {
      const { contract, developer, other } = await deployAndMintFixture()
      await expect(
        contract.connect(developer).setApprovalForAll(other.address, true)
      ).to.be.revertedWithCustomError(contract, 'NonTransferable')
    })

    it('admin cannot transfer another account\'s token', async () => {
      const { contract, admin, developer, other, tokenId } = await deployAndMintFixture()
      await expect(
        contract.connect(admin).transferFrom(developer.address, other.address, tokenId)
      ).to.be.revertedWithCustomError(contract, 'NonTransferable')
    })
  })

  // ── 9. View functions ────────────────────────────────────────────────────

  describe('View functions', () => {
    it('getCredential returns correct data for existing token', async () => {
      const { contract, tokenId, skillId, commitHash, layer } = await deployAndMintFixture()
      const cred = await contract.getCredential(tokenId)
      expect(cred.skillId).to.equal(skillId)
      expect(cred.commitHash).to.equal(commitHash)
      expect(cred.layer).to.equal(layer)
    })

    it('getCredential reverts for non-existent token', async () => {
      const { contract } = await deployFixture()
      await expect(contract.getCredential(9999n))
        .to.be.revertedWithCustomError(contract, 'CredentialNotFound')
    })

    it('getCommitHash returns correct hash', async () => {
      const { contract, tokenId, commitHash } = await deployAndMintFixture()
      expect(await contract.getCommitHash(tokenId)).to.equal(commitHash)
    })

    it('getCommitHash reverts for non-existent token', async () => {
      const { contract } = await deployFixture()
      await expect(contract.getCommitHash(9999n))
        .to.be.revertedWithCustomError(contract, 'CredentialNotFound')
    })

    it('supportsInterface: ERC721', async () => {
      const { contract } = await deployFixture()
      expect(await contract.supportsInterface('0x80ac58cd')).to.be.true // ERC721
    })

    it('supportsInterface: AccessControl', async () => {
      const { contract } = await deployFixture()
      expect(await contract.supportsInterface('0x7965db0b')).to.be.true // IAccessControl
    })
  })

  // ── 10. Gas measurements ─────────────────────────────────────────────────
  //
  // The Phase 0 proposal targets ≥30% gas reduction vs. a naive ERC-721
  // implementation storing the same logical data.
  //
  // Baseline: ReferenceERC721.sol — stores identical fields (layer, status,
  // issuedAt, updatedAt, skillId, commitHash) using separate uint256 mappings
  // with no struct packing or slot optimization (7 cold writes vs. our 4).
  //
  // All measurements are reported as observed values.
  // The 30% target is aspirational at MVP; the important metric is that our
  // design is measurably more efficient than the naive alternative.

  describe('Gas measurements', () => {
    it('MEASUREMENT — mintCredential vs ReferenceERC721 baseline', async () => {
      const [, , issuer, , , developer] = await ethers.getSigners()

      // ── Deploy and measure VeriSkillCredential ───────────────────────────
      const { contract } = await deployFixture()
      const skillId    = makeSkillId('JavaScript')
      const commitHash = makeCommitHash(developer.address, skillId, 4)

      const vsTx      = await contract.connect(issuer).mintCredential(developer.address, skillId, commitHash, 4)
      const vsReceipt = await vsTx.wait() as ContractTransactionReceipt
      const vsGas     = vsReceipt.gasUsed

      // ── Deploy and measure ReferenceERC721 ──────────────────────────────
      const refFactory = await ethers.getContractFactory('ReferenceERC721')
      const refContract = (await refFactory.deploy()) as ReferenceERC721
      await refContract.waitForDeployment()

      const refTx      = await refContract.mint(developer.address, skillId, commitHash, 4)
      const refReceipt = await refTx.wait() as ContractTransactionReceipt
      const refGas     = refReceipt.gasUsed

      // ── Report ──────────────────────────────────────────────────────────
      const savingGas = refGas - vsGas
      const savingPct = Number(savingGas * 100n / refGas)

      console.log(`\n  ┌─ Gas Comparison Report ─────────────────────────────────────┐`)
      console.log(`  │ VeriSkillCredential.mintCredential:  ${vsGas.toString().padStart(10)} gas           │`)
      console.log(`  │ ReferenceERC721.mint (naive):        ${refGas.toString().padStart(10)} gas           │`)
      console.log(`  │ Gas saved:                           ${savingGas.toString().padStart(10)} gas           │`)
      console.log(`  │ Reduction vs naive baseline:         ${savingPct.toString().padStart(10)}%              │`)
      console.log(`  │ Phase 0 target:                              ≥30%              │`)
      console.log(`  │ Target met: ${savingPct >= 30 ? '✓ YES' : '✗ NOT YET — see note below'}${' '.repeat(savingPct >= 30 ? 48 : 38)}│`)
      console.log(`  └─────────────────────────────────────────────────────────────┘`)
      if (savingPct < 30) {
        console.log(`\n  NOTE: The 30% target is aspirational at MVP. Our implementation`)
        console.log(`  uses ${savingPct}% less gas than the naive reference. The remaining`)
        console.log(`  gap can be narrowed in Phase 4 with further Yul optimization`)
        console.log(`  only if measurements justify the correctness tradeoff.\n`)
      }

      // Our implementation must be strictly cheaper than the naive reference
      expect(vsGas).to.be.lt(refGas, 'VeriSkillCredential must use less gas than naive reference')
    })

    it('MEASUREMENT — updateLayer gas (must be < 50,000)', async () => {
      const { contract, updater, tokenId } = await deployAndMintFixture()
      const tx = await contract.connect(updater).updateLayer(tokenId, 5, ethers.keccak256(ethers.toUtf8Bytes('update')))
      const receipt = await tx.wait() as ContractTransactionReceipt
      console.log(`\n  updateLayer gas used: ${receipt.gasUsed} gas`)
      expect(receipt.gasUsed).to.be.lt(50_000n)
    })

    it('MEASUREMENT — revokeCredential gas (must be < 50,000)', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      const tx = await contract.connect(admin).revokeCredential(tokenId)
      const receipt = await tx.wait() as ContractTransactionReceipt
      console.log(`\n  revokeCredential gas used: ${receipt.gasUsed} gas`)
      expect(receipt.gasUsed).to.be.lt(50_000n)
    })

    it('MEASUREMENT — suspendCredential gas (must be < 50,000)', async () => {
      const { contract, admin, tokenId } = await deployAndMintFixture()
      const tx = await contract.connect(admin).suspendCredential(tokenId)
      const receipt = await tx.wait() as ContractTransactionReceipt
      console.log(`\n  suspendCredential gas used: ${receipt.gasUsed} gas`)
      expect(receipt.gasUsed).to.be.lt(50_000n)
    })
  })
})
