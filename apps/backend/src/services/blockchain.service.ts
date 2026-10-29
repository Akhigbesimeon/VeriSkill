import { ethers } from 'ethers'
import VeriSkillCredentialABI from '@veriskill/shared/src/abi/VeriSkillCredential.json'
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

/**
 * Load + validate a credential for minting. Shared by both the sponsored path
 * (mintCredential) and the voucher path (signMintVoucher). Returns the
 * credential + its developer so callers don't re-query.
 */
async function loadMintable(
  credentialId: string,
  opts: { requireOwnership?: string } = {}
) {
  const credential = await Credential.findByPk(credentialId, {
    include: [{ association: 'developer', attributes: ['id', 'walletAddress', 'walletType'] }],
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
  const developer = (credential as any).developer as { walletAddress: string | null; walletType: string }
  if (!developer?.walletAddress) {
    throw new ValidationError('Developer wallet address not yet assigned')
  }
  return { credential, developer }
}

export async function mintCredential(
  credentialId: string,
  actorId: string,
  opts: { requireOwnership?: string } = {}
): Promise<string> {
  const { credential, developer } = await loadMintable(credentialId, opts)

  const contract = getContract()
  const skillId = deriveSkillId(credential.skill)
  const issuedAt = Math.floor(Date.now() / 1000)
  const commitHash = computeCommitHash(
    developer.walletAddress!,
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

export interface MintVoucher {
  to: string
  skillId: string
  commitHash: string
  layer: number
  deadline: number
  nonce: string
}

export interface SignedMintVoucher {
  voucher: MintVoucher
  signature: string
  chainId: number
  contractAddress: string
}

const VOUCHER_TYPES = {
  MintVoucher: [
    { name: 'to',         type: 'address' },
    { name: 'skillId',    type: 'bytes32' },
    { name: 'commitHash', type: 'bytes32' },
    { name: 'layer',      type: 'uint8' },
    { name: 'deadline',   type: 'uint256' },
    { name: 'nonce',      type: 'uint256' },
  ],
}

/**
 * Build + sign an EIP-712 mint voucher. The developer takes this to their own
 * wallet and calls contract.mintWithVoucher(...) themselves — the backend
 * never submits a tx and never pays gas. Verification gating is preserved
 * because the contract only accepts vouchers signed by an ISSUER_ROLE holder.
 */
export async function signMintVoucher(
  credentialId: string,
  requesterId: string,
): Promise<SignedMintVoucher> {
  const { credential, developer } = await loadMintable(credentialId, {
    requireOwnership: requesterId,
  })

  const to = developer.walletAddress!
  const skillId = deriveSkillId(credential.skill)
  const issuedAt = Math.floor(Date.now() / 1000)
  const commitHash = computeCommitHash(to, skillId, credential.verificationLayer, issuedAt)

  const provider = getProvider()
  const { chainId } = await provider.getNetwork()

  // Read the current nonce from the contract so the voucher we sign is the one
  // the developer can actually spend. Nonce advances on every successful mint.
  const contract = getContract()
  const nonce: bigint = await contract.nonces(to)

  const voucher: MintVoucher = {
    to,
    skillId,
    commitHash,
    layer: credential.verificationLayer,
    deadline: issuedAt + 3600,
    nonce: nonce.toString(),
  }

  const signer = getIssuerSigner()
  const domain = {
    name: 'VeriSkillCredential',
    version: '1',
    chainId: Number(chainId),
    verifyingContract: env.CONTRACT_ADDRESS,
  }
  const signature = await signer.signTypedData(domain, VOUCHER_TYPES, voucher)

  return { voucher, signature, chainId: Number(chainId), contractAddress: env.CONTRACT_ADDRESS }
}

/**
 * Called by the frontend after the developer's wallet submits the on-chain
 * mintWithVoucher tx. Verifies the tx on-chain, extracts the tokenId from the
 * CredentialMinted event, and persists the credential as MINTED. Idempotent:
 * if the credential is already minted, returns the existing tokenId.
 */
export async function confirmMint(
  credentialId: string,
  requesterId: string,
  txHash: string,
): Promise<string> {
  const credential = await Credential.findByPk(credentialId)
  if (!credential) throw new NotFoundError('Credential not found')
  if (credential.developerId !== requesterId) throw new NotFoundError('Credential not found')
  if (credential.lifecycleStatus === 'MINTED' && credential.tokenId) {
    return credential.tokenId
  }

  const provider = getProvider()
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) throw new ValidationError('Transaction not yet mined — try again shortly')
  if (receipt.status !== 1) throw new ValidationError('Mint transaction reverted')

  const contract = getContract()
  const parsed = receipt.logs
    .map((log) => { try { return contract.interface.parseLog(log) } catch { return null } })
    .filter((e): e is NonNullable<typeof e> => e !== null)

  const minted = parsed.find((e) => e.name === 'CredentialMinted')
  if (!minted) throw new ValidationError('No CredentialMinted event in transaction')
  const attested = parsed.find((e) => e.name === 'CredentialAttested')

  const tokenId: string = minted.args.tokenId.toString()
  const commitHash: string = minted.args.commitHash
  const easUid: string | null = attested?.args?.easUid ?? null

  await credential.update({
    tokenId,
    commitHash,
    lifecycleStatus: 'MINTED',
    onChainMintedAt: new Date(),
  })

  await AuditLog.create({
    actorId: requesterId,
    action: 'credential.minted',
    resourceType: 'credential',
    resourceId: credentialId,
    payload: {
      tokenId,
      easUid,
      txHash: receipt.hash,
      layer: credential.verificationLayer,
      source: 'voucher',
    },
  })

  return tokenId
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
