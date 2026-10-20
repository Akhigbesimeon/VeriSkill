import { ethers } from 'ethers'
import VeriSkillCredentialABI from '../../../../packages/shared/src/abi/VeriSkillCredential.json'
import { env } from '../config/env'
import { Credential } from '../models/Credential'
import { AuditLog } from '../models/AuditLog'
import { ValidationError, NotFoundError } from '../middleware/error.middleware'

// The contract wraps EAS internally — mint and attest run in one tx, so the
// receipt carries both the ERC721 CredentialMinted and EAS CredentialAttested
// events. The backend never calls the EAS SDK directly.

function getProvider() {
  return new ethers.JsonRpcProvider(env.RPC_URL)
}

function getIssuerSigner() {
  return new ethers.Wallet(env.ISSUER_PRIVATE_KEY, getProvider())
}

function getContract() {
  return new ethers.Contract(env.CONTRACT_ADDRESS, VeriSkillCredentialABI, getIssuerSigner())
}

// The commit hash shape must match the off-chain EAS schema so verifiers can
// bind the on-chain record to off-chain data.
function computeCommitHash(
  developerAddress: string,
  skillId: string,
  layer: number,
  issuedAt: number
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32', 'bytes32', 'uint8', 'uint40'],
      [developerAddress, skillId, ethers.ZeroHash, layer, issuedAt]
    )
  )
}

function deriveSkillId(skillName: string): string {
  return ethers.keccak256(
    ethers.solidityPackedKeccak256(['string', 'string'], [skillName, '1'])
  )
}

export async function mintCredential(
  credentialId: string,
  actorId: string,
  opts: { requireOwnership?: string } = {}
): Promise<string> {
  const credential = await Credential.findByPk(credentialId, {
    include: [{ association: 'developer', attributes: ['id', 'walletAddress'] }],
  })
  if (!credential) throw new NotFoundError('Credential not found')

  if (opts.requireOwnership && credential.developerId !== opts.requireOwnership) {
    throw new NotFoundError('Credential not found')
  }

  if (credential.verificationLayer < 4) {
    throw new ValidationError(
      `Minting requires Layer ≥ 4 (current: Layer ${credential.verificationLayer})`
    )
  }

  if (credential.lifecycleStatus === 'MINTED') {
    throw new ValidationError('Credential already minted')
  }

  const developer = (credential as any).developer
  if (!developer?.walletAddress) {
    throw new ValidationError('Developer wallet address not yet assigned')
  }

  const contract = getContract()
  const skillId = deriveSkillId(credential.skill)
  const issuedAt = Math.floor(Date.now() / 1000)
  const commitHash = computeCommitHash(
    developer.walletAddress,
    skillId,
    credential.verificationLayer,
    issuedAt
  )

  const tx = await contract.mintCredential(
    developer.walletAddress,
    skillId,
    commitHash,
    credential.verificationLayer
  )
  const receipt = await tx.wait()

  const events = receipt.logs
    .map((log: any) => { try { return contract.interface.parseLog(log) } catch { return null } })
    .filter(Boolean)

  const minted = events.find((e: any) => e?.name === 'CredentialMinted')
  const attested = events.find((e: any) => e?.name === 'CredentialAttested')

  const tokenId = minted?.args?.tokenId?.toString() ?? null
  const easUid = attested?.args?.easUid ?? null

  await credential.update({
    tokenId,
    commitHash,
    lifecycleStatus: 'MINTED',
    onChainMintedAt: new Date(),
  })

  await AuditLog.create({
    actorId,
    action: 'credential.minted',
    resourceType: 'credential',
    resourceId: credentialId,
    payload: {
      tokenId,
      easUid,
      txHash: receipt.hash,
      layer: credential.verificationLayer,
    },
  })

  return tokenId ?? receipt.hash
}

export async function revokeOnChain(credentialId: string, actorId: string): Promise<void> {
  const credential = await Credential.findByPk(credentialId)
  if (!credential) throw new NotFoundError('Credential not found')
  if (!credential.tokenId) throw new ValidationError('Credential has not been minted')

  const contract = getContract()
  // Contract revokes the EAS attestation internally; no separate SDK call.
  const tx = await contract.revokeCredential(BigInt(credential.tokenId))
  await tx.wait()

  await credential.update({ lifecycleStatus: 'REVOKED' })

  await AuditLog.create({
    actorId,
    action: 'credential.revoked',
    resourceType: 'credential',
    resourceId: credentialId,
    payload: { tokenId: credential.tokenId },
  })
}
