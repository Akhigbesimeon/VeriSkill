/// <reference types="mocha" />
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { ContractTransactionReceipt, Log } from 'ethers'
import {
  VeriSkillCredential__factory,
  VeriSkillResolver__factory,
  EAS__factory,
  SchemaRegistry__factory,
} from '../typechain-types'

const ISSUER_ROLE  = ethers.keccak256(ethers.toUtf8Bytes('ISSUER_ROLE'))
const REVOKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('REVOKER_ROLE'))
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash

const SCHEMA = 'bytes32 skillId,bytes32 commitHash,uint8 layer,uint256 tokenId'

function makeSkillId(name: string, version = '1'): string {
  return ethers.keccak256(ethers.solidityPackedKeccak256(['string', 'string'], [name, version]))
}

function makeCommitHash(owner: string, skillId: string, layer: number): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'bytes32', 'uint8', 'uint40'],
      [owner, skillId, ethers.ZeroHash, layer, Math.floor(Date.now() / 1000)]
    )
  )
}

async function deployFixture() {
  const [deployer, admin, issuer, developer, other] = await ethers.getSigners()

  // Deploy real EAS + SchemaRegistry from the EAS package (local).
  const registry = await new SchemaRegistry__factory(deployer).deploy()
  await registry.waitForDeployment()

  const eas = await new EAS__factory(deployer).deploy(await registry.getAddress())
  await eas.waitForDeployment()

  // Resolver + schema.
  const resolver = await new VeriSkillResolver__factory(deployer).deploy(await eas.getAddress(), admin.address)
  await resolver.waitForDeployment()

  const regTx = await registry.register(SCHEMA, await resolver.getAddress(), true)
  const regReceipt = await regTx.wait()
  const regLog = regReceipt!.logs.find((l: Log) => {
    try { return registry.interface.parseLog(l as any)?.name === 'Registered' } catch { return false }
  })
  const schemaUid: string = registry.interface.parseLog(regLog as any)!.args.uid

  // Credential contract.
  const contract = await new VeriSkillCredential__factory(deployer).deploy(admin.address, await eas.getAddress(), schemaUid)
  await contract.waitForDeployment()

  await resolver.connect(admin).setAttester(await contract.getAddress())

  // Wire resolver → credential as the sole attester.
  await resolver.connect(admin).setAttester(await contract.getAddress())

  // Grant ISSUER_ROLE to the issuer signer.
  await contract.connect(admin).grantRole(ISSUER_ROLE, issuer.address)

  return { contract, resolver, eas, registry, schemaUid, deployer, admin, issuer, developer, other }
}

describe('VeriSkillCredential (hybrid ERC721 + EAS)', () => {

  describe('Deployment', () => {
    it('rejects zero EAS address and zero schemaUid', async () => {
      const [deployer, admin] = await ethers.getSigners()
      const factory = new VeriSkillCredential__factory(deployer)
      await expect(factory.deploy(admin.address, ethers.ZeroAddress, ethers.id('x')))
        .to.be.revertedWith('VeriSkill: EAS cannot be zero address')
    })

    it('grants DEFAULT_ADMIN_ROLE + REVOKER_ROLE to admin', async () => {
      const { contract, admin } = await deployFixture()
      expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true
      expect(await contract.hasRole(REVOKER_ROLE, admin.address)).to.be.true
    })
  })

  describe('mintCredential', () => {
    it('mints and emits both CredentialMinted and CredentialAttested in one tx', async () => {
      const { contract, issuer, developer } = await deployFixture()
      const skillId = makeSkillId('JavaScript')
      const commitHash = makeCommitHash(developer.address, skillId, 4)

      const tx = await contract.connect(issuer).mintCredential(developer.address, skillId, commitHash, 4)
      const receipt = (await tx.wait()) as ContractTransactionReceipt

      const minted = receipt.logs
        .map(l => { try { return contract.interface.parseLog(l as any) } catch { return null } })
        .find(e => e?.name === 'CredentialMinted')
      const attested = receipt.logs
        .map(l => { try { return contract.interface.parseLog(l as any) } catch { return null } })
        .find(e => e?.name === 'CredentialAttested')

      expect(minted).to.exist
      expect(attested).to.exist
      expect(minted!.args.tokenId).to.equal(1n)
      expect(attested!.args.easUid).to.not.equal(ethers.ZeroHash)

      const stored = await contract.getAttestationUid(1n)
      expect(stored).to.equal(attested!.args.easUid)
    })

    it('reverts if caller lacks ISSUER_ROLE', async () => {
      const { contract, other, developer } = await deployFixture()
      const skillId = makeSkillId('Python')
      const commitHash = makeCommitHash(developer.address, skillId, 4)
      await expect(contract.connect(other).mintCredential(developer.address, skillId, commitHash, 4))
        .to.be.revertedWithCustomError(contract, 'AccessControlUnauthorizedAccount')
    })

    it('reverts when layer is below MIN_LAYER_TO_MINT', async () => {
      const { contract, issuer, developer } = await deployFixture()
      const skillId = makeSkillId('Java')
      const commitHash = makeCommitHash(developer.address, skillId, 3)
      await expect(contract.connect(issuer).mintCredential(developer.address, skillId, commitHash, 3))
        .to.be.revertedWithCustomError(contract, 'LayerBelowMintMinimum')
    })
  })

  describe('revokeCredential', () => {
    it('revokes locally AND revokes the EAS attestation', async () => {
      const { contract, eas, admin, issuer, developer } = await deployFixture()
      const skillId = makeSkillId('Solidity')
      const commitHash = makeCommitHash(developer.address, skillId, 4)
      await contract.connect(issuer).mintCredential(developer.address, skillId, commitHash, 4)
      const easUid = await contract.getAttestationUid(1n)

      await contract.connect(admin).revokeCredential(1n)

      expect(await contract.isRevoked(1n)).to.be.true
      const attestation = await eas.getAttestation(easUid)
      expect(attestation.revocationTime).to.be.greaterThan(0n)
    })
  })

  describe('Non-transferability', () => {
    it('reverts on transferFrom', async () => {
      const { contract, issuer, developer, other } = await deployFixture()
      const skillId = makeSkillId('React')
      const commitHash = makeCommitHash(developer.address, skillId, 4)
      await contract.connect(issuer).mintCredential(developer.address, skillId, commitHash, 4)
      await expect(contract.connect(developer).transferFrom(developer.address, other.address, 1n))
        .to.be.revertedWithCustomError(contract, 'NonTransferable')
    })

    it('reverts on approve', async () => {
      const { contract, issuer, developer, other } = await deployFixture()
      const skillId = makeSkillId('Node.js')
      const commitHash = makeCommitHash(developer.address, skillId, 4)
      await contract.connect(issuer).mintCredential(developer.address, skillId, commitHash, 4)
      await expect(contract.connect(developer).approve(other.address, 1n))
        .to.be.revertedWithCustomError(contract, 'NonTransferable')
    })
  })

  describe('Resolver guard', () => {
    it('rejects attestations from an unauthorised attester', async () => {
      const { eas, schemaUid, admin, other, developer } = await deployFixture()
      // Try to attest directly from `other`, bypassing the credential contract.
      await expect(
        eas.connect(other).attest({
          schema: schemaUid,
          data: {
            recipient: developer.address,
            expirationTime: 0,
            revocable: true,
            refUID: ethers.ZeroHash,
            data: ethers.AbiCoder.defaultAbiCoder().encode(
              ['bytes32', 'bytes32', 'uint8', 'uint256'],
              [makeSkillId('Docker'), ethers.ZeroHash, 4, 999n]
            ),
            value: 0,
          },
        })
      ).to.be.reverted // resolver's UnauthorisedAttester
    })
  })
})
