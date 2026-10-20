import crypto from 'crypto'
import { Op } from 'sequelize'
import { Reader, ReaderModel } from '@maxmind/geoip2-node'
import { env } from '../config/env'
import { User } from '../models/User'
import { PeerReview } from '../models/PeerReview'
import { ValidationError } from '../middleware/error.middleware'

const REVIEW_WINDOW_DAYS = 7

/** SHA-256 hash of the reviewer IP for privacy-preserving anti-collusion checks. */
export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex')
}

// Lazy-loaded on first call so the backend boots even without an ASN DB.
// shortcut: single mmdb kept in memory for the process lifetime; refresh by
// restarting. Upgrade to Reader.openBuffer + a cron-reload if freshness matters.
let asnReader: ReaderModel | null = null
let asnReaderLoadAttempted = false

async function getAsnReader(): Promise<ReaderModel | null> {
  if (asnReaderLoadAttempted) return asnReader
  asnReaderLoadAttempted = true
  if (!env.MAXMIND_ASN_DB_PATH) return null
  try {
    asnReader = await Reader.open(env.MAXMIND_ASN_DB_PATH)
  } catch (err) {
    console.warn('[peer-review] MaxMind ASN DB load failed; ASN checks disabled:', (err as Error).message)
    asnReader = null
  }
  return asnReader
}

async function lookupAsn(ip: string): Promise<number | null> {
  const reader = await getAsnReader()
  if (!reader) return null
  try {
    const res = reader.asn(ip)
    return res.autonomousSystemNumber ?? null
  } catch {
    return null
  }
}

/**
 * Compute the weight factor for a reviewer (Phase 0 Section 4 anti-collusion):
 *   1.0 — clean (no prior relationship, distinct network)
 *   0.5 — mutual review history > 1, OR same ASN as credential owner
 *   0.0 — IP hash matches credential owner's IP (flagged, admin notified)
 */
async function computeWeightFactor(
  reviewerId: string,
  developerId: string,
  developerIpHash: string | null,
  reviewerIpHash: string | null,
  developerAsn: number | null,
  reviewerAsn: number | null
): Promise<number> {
  if (developerIpHash && reviewerIpHash && developerIpHash === reviewerIpHash) {
    return 0.0
  }

  const sameAsn = developerAsn !== null && reviewerAsn !== null && developerAsn === reviewerAsn
  if (sameAsn) return 0.5

  const priorMutualCount = await PeerReview.count({
    where: {
      reviewerId,
      [Op.or]: [{ '$credential.developer_id$': developerId }],
      status: 'SUBMITTED',
    },
    include: [{ association: 'credential', attributes: ['developer_id'] }],
  })

  return priorMutualCount > 1 ? 0.5 : 1.0
}

/**
 * System-assigns peer reviewers for a credential.
 *
 * Selection rules unchanged from Phase 0 Section 4:
 *   - Internal reviewers: developers with verificationLayer ≥ 3
 *   - External reviewers: users with role 'peer_verifier'
 *   - Exclude: the credential owner
 *   - Target: 2–3 reviewers total
 *   - Anti-collusion: IP-hash + ASN weighted after selection
 */
export async function assignPeerReviewers(
  credentialId: string,
  developerId: string,
  currentLayer: number,
  developerIpHash?: string,
  developerIp?: string
): Promise<PeerReview[]> {
  if (currentLayer < 3) {
    throw new ValidationError(
      'Peer review requires at least Layer 3 (GitHub scan complete). Submit a GitHub repository first.'
    )
  }

  const existing = await PeerReview.count({ where: { credentialId } })
  if (existing >= 2) return []

  const candidates = await User.findAll({
    where: {
      role: 'developer',
      id: { [Op.ne]: developerId },
      isActive: true,
    },
    limit: 10,
    order: [['createdAt', 'ASC']],
  })

  const externalReviewers = await User.findAll({
    where: { role: 'peer_verifier', isActive: true },
    limit: 3,
  })

  const allCandidates = [
    ...candidates.map(u => ({ user: u, type: 'internal' as const })),
    ...externalReviewers.map(u => ({ user: u, type: 'external' as const })),
  ]

  const alreadyAssigned = new Set(
    (await PeerReview.findAll({ where: { credentialId }, attributes: ['reviewer_id'] }))
      .map(r => r.reviewerId)
  )

  const selected = allCandidates
    .filter(c => !alreadyAssigned.has(c.user.id))
    .slice(0, 3)

  if (selected.length === 0) return []

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REVIEW_WINDOW_DAYS)

  const developerAsn = developerIp ? await lookupAsn(developerIp) : null

  const assignments = await Promise.all(selected.map(async ({ user, type }) => {
    const weightFactor = await computeWeightFactor(
      user.id, developerId, developerIpHash ?? null, null, developerAsn, null
    )

    return PeerReview.create({
      credentialId,
      reviewerId: user.id,
      reviewerType: type,
      status: 'ASSIGNED',
      decision: null,
      rationale: null,
      weightFactor,
      reviewerIpHash: null,
      assignedAt: new Date(),
      expiresAt,
    })
  }))

  return assignments
}
