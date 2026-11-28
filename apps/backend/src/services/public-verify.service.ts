import { Credential } from '../models/Credential'
import { AuditLog } from '../models/AuditLog'
import { env } from '../config/env'
import type { PublicVerdict, PublicVerdictStatus } from '@veriskill/shared'

/**
 * Verdict payload returned by both the public GET and the batch POST.
 *
 * The TYPE is the single source of truth: it lives in packages/shared, is
 * shared with the published typed client, and is enforced by Zod at every
 * test boundary. Any shape change must be made in packages/shared first so
 * the backend, the client and the docs/openapi.yaml stay aligned.
 *
 * Privacy contract: this payload is public. It must never include developer
 * email, wallet address, reviewer identities, raw evidence URLs, or any
 * other off-chain personal data.
 */
export type { PublicVerdict, PublicVerdictStatus }

// NOT_FOUND response — shared helper so the shape is identical to a found
// response minus the data. Status codes still differentiate at the HTTP level
// (200 for found, 404 for not found) but the body shape is uniform so batch
// callers can treat every entry the same way.
function notFoundVerdict(id: string): PublicVerdict {
  return {
    id,
    status: 'NOT_FOUND',
    skill: null,
    layer: null,
    trustScore: null,
    issuedAt: null,
    verifiedAt: new Date().toISOString(),
    onChain: null,
  }
}

function lifecycleToStatus(lifecycle: string): PublicVerdictStatus {
  // The Credential model has a richer off-chain status machine (DRAFT, ACTIVE,
  // PENDING_REVIEW, MINTED, APPEALING, SUSPENDED, REVOKED, REJECTED). From a
  // recruiter's point of view, only MINTED-and-not-revoked is worth anything;
  // anything else is either in flight or dead. Collapse to the three verdicts
  // a human actually cares about.
  if (lifecycle === 'SUSPENDED') return 'SUSPENDED'
  if (lifecycle === 'REVOKED')   return 'REVOKED'
  if (lifecycle === 'MINTED')    return 'VALID'
  // DRAFT/ACTIVE/PENDING_REVIEW/APPEALING/REJECTED all = "nothing to verify
  // yet" from a recruiter's angle. Treat as NOT_FOUND to avoid leaking the
  // internal state machine.
  return 'NOT_FOUND'
}

/**
 * Build a verdict for one credential ID. If the credential does not exist or
 * is not minted, returns a NOT_FOUND verdict instead of null so batch callers
 * can map input→output 1:1.
 */
export async function buildVerdict(id: string): Promise<PublicVerdict> {
  const credential = await Credential.findByPk(id)
  if (!credential) return notFoundVerdict(id)

  const status = lifecycleToStatus(credential.lifecycleStatus)
  if (status === 'NOT_FOUND') return notFoundVerdict(id)

  // Pull the mint audit record to get easUid + txHash. These are not persisted
  // on the Credential row (see blockchain.service.mintCredential line 119+).
  // One extra query per credential; batched variant below avoids N+1.
  const mint = await AuditLog.findOne({
    where: { action: 'credential.minted', resourceType: 'credential', resourceId: id },
    order: [['createdAt', 'DESC']],
  })
  const payload = (mint?.payload ?? {}) as { easUid?: string; txHash?: string }

  return {
    id: credential.id,
    status,
    skill: credential.skill,
    layer: credential.verificationLayer,
    trustScore: credential.trustScore,
    issuedAt: credential.onChainMintedAt?.toISOString() ?? null,
    verifiedAt: new Date().toISOString(),
    onChain: credential.tokenId ? {
      chain:             env.CHAIN_NAME,
      chainId:           env.CHAIN_ID,
      contractAddress:   env.CONTRACT_ADDRESS,
      tokenId:           credential.tokenId,
      easAttestationUid: payload.easUid ?? null,
      txHash:            payload.txHash ?? null,
    } : null,
  }
}

/**
 * Build verdicts for a batch of credential IDs, preserving input order.
 * Two queries total: one for credentials, one for audit logs.
 */
export async function buildVerdictBatch(ids: string[]): Promise<PublicVerdict[]> {
  if (ids.length === 0) return []

  const [credentials, mintLogs] = await Promise.all([
    Credential.findAll({ where: { id: ids } }),
    AuditLog.findAll({
      where: {
        action: 'credential.minted',
        resourceType: 'credential',
        resourceId: ids,
      },
      order: [['createdAt', 'DESC']],
    }),
  ])

  const credById  = new Map(credentials.map(c => [c.id, c]))
  const mintById  = new Map<string, { easUid?: string; txHash?: string }>()
  // AuditLog is append-only; findAll ordered DESC gives us most-recent first.
  // Keep the first entry per resourceId (latest mint record wins).
  for (const log of mintLogs) {
    if (!mintById.has(log.resourceId)) {
      mintById.set(log.resourceId, (log.payload ?? {}) as { easUid?: string; txHash?: string })
    }
  }

  const now = new Date().toISOString()
  return ids.map(id => {
    const c = credById.get(id)
    if (!c) return notFoundVerdict(id)

    const status = lifecycleToStatus(c.lifecycleStatus)
    if (status === 'NOT_FOUND') return notFoundVerdict(id)

    const payload = mintById.get(id) ?? {}
    return {
      id: c.id,
      status,
      skill: c.skill,
      layer: c.verificationLayer,
      trustScore: c.trustScore,
      issuedAt: c.onChainMintedAt?.toISOString() ?? null,
      verifiedAt: now,
      onChain: c.tokenId ? {
        chain:             env.CHAIN_NAME,
        chainId:           env.CHAIN_ID,
        contractAddress:   env.CONTRACT_ADDRESS,
        tokenId:           c.tokenId,
        easAttestationUid: payload.easUid ?? null,
        txHash:            payload.txHash ?? null,
      } : null,
    }
  })
}
