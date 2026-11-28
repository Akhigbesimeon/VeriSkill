import crypto from 'crypto'
import { Op } from 'sequelize'
import { Reader, ReaderModel } from '@maxmind/geoip2-node'
import { env } from '../config/env'
import { User } from '../models/User'
import { Credential } from '../models/Credential'
import { PeerReview, PeerReviewWeightFactors } from '../models/PeerReview'
import { ExpertReview } from '../models/ExpertReview'
import { ValidationError } from '../middleware/error.middleware'

const REVIEW_WINDOW_DAYS = 7
const MS_PER_DAY = 86_400_000

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

export async function lookupAsn(ip: string): Promise<number | null> {
  const reader = await getAsnReader()
  if (!reader) return null
  try {
    const res = reader.asn(ip)
    return res.autonomousSystemNumber ?? null
  } catch {
    return null
  }
}

// ─── Eligibility ────────────────────────────────────────────────────────────

export interface EligibilityCheck {
  eligible: boolean
  reason?: 'account_too_new' | 'self_review' | 'too_many_mutual' | 'no_qualifying_credential'
  skillMatched: boolean          // true when reviewer has a same-skill L3+ credential
}

/**
 * A reviewer must:
 *   1. not be the credential owner (self-review guard, defence in depth),
 *   2. have an account at least PEER_REVIEW_MIN_ACCOUNT_AGE_DAYS old,
 *   3. hold ≥1 credential at Layer 3 or above (any skill, preferring same skill),
 *   4. have reviewed this developer no more than PEER_REVIEW_MAX_MUTUAL_REVIEWS times.
 *
 * Rule 3 is deliberately a soft "prefer same skill, fall back to any L3+" because
 * the demo dataset is small; the fallback is recorded in the audit trail so an
 * admin can see when it was used.
 */
export async function checkEligibility(
  reviewerId: string,
  developerId: string,
  credentialSkill: string,
  now: Date = new Date(),
): Promise<EligibilityCheck> {
  if (reviewerId === developerId) {
    return { eligible: false, reason: 'self_review', skillMatched: false }
  }

  const reviewer = await User.findByPk(reviewerId, { attributes: ['id', 'role', 'createdAt'] })
  if (!reviewer) return { eligible: false, reason: 'account_too_new', skillMatched: false }

  const ageDays = (now.getTime() - new Date(reviewer.createdAt).getTime()) / MS_PER_DAY
  if (ageDays < env.PEER_REVIEW_MIN_ACCOUNT_AGE_DAYS) {
    return { eligible: false, reason: 'account_too_new', skillMatched: false }
  }

  // peer_verifier / expert_verifier accounts are vetted; they don't need a
  // qualifying credential of their own.
  const needsCredential = reviewer.role === 'developer'
  let skillMatched = false
  if (needsCredential) {
    const sameSkill = await Credential.count({
      where: { developerId: reviewerId, skill: credentialSkill, verificationLayer: { [Op.gte]: 3 } },
    })
    if (sameSkill > 0) {
      skillMatched = true
    } else {
      const anyL3 = await Credential.count({
        where: { developerId: reviewerId, verificationLayer: { [Op.gte]: 3 } },
      })
      if (anyL3 === 0) {
        return { eligible: false, reason: 'no_qualifying_credential', skillMatched: false }
      }
    }
  }

  const mutual = await PeerReview.count({
    where: { reviewerId, status: 'SUBMITTED' },
    include: [{
      association: 'credential',
      attributes: ['id'],
      where: { developerId },
      required: true,
    }],
  })
  if (mutual >= env.PEER_REVIEW_MAX_MUTUAL_REVIEWS) {
    return { eligible: false, reason: 'too_many_mutual', skillMatched }
  }

  return { eligible: true, skillMatched }
}

// ─── Text heuristics (pure, exported for the simulation) ────────────────────

/** Normalise whitespace + case so trivial edits don't defeat a duplicate check. */
export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** SHA-256 of the normalised text — used for exact-duplicate detection. */
export function textFingerprint(s: string): string {
  return crypto.createHash('sha256').update(normalizeText(s)).digest('hex')
}

/** Character 5-shingles. Short texts (<5 chars) yield a single shingle. */
function shingles(s: string, size = 5): Set<string> {
  const norm = normalizeText(s)
  if (norm.length <= size) return new Set([norm])
  const out = new Set<string>()
  for (let i = 0; i <= norm.length - size; i++) out.add(norm.slice(i, i + size))
  return out
}

/** Jaccard similarity between two strings via character 5-shingles, 0–1. */
export function shingleJaccard(a: string, b: string): number {
  const A = shingles(a)
  const B = shingles(b)
  if (A.size === 0 && B.size === 0) return 1
  let inter = 0
  for (const s of A) if (B.has(s)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

/** The maximum similarity between `text` and any prior review's rationale. */
export function maxSimilarity(text: string, history: string[]): number {
  let best = 0
  for (const h of history) {
    const score = shingleJaccard(text, h)
    if (score > best) best = score
    if (best >= 1) break
  }
  return best
}

// ─── Weight computation ─────────────────────────────────────────────────────

export interface WeightInputs {
  sameIpHash: boolean          // reviewer and developer hash to the same IP
  sameAsn: boolean             // reviewer and developer on same ASN (null-safe)
  priorMutual: number          // reviewer's past SUBMITTED reviews on this developer
  skillMatched: boolean        // reviewer has a same-skill L3+ credential
  agreementRate: number | null // 0–1 agreement with expert outcomes; null when no history
  fastSubmit: boolean          // submitted inside PEER_REVIEW_FAST_SUBMIT_SECONDS
  nearDuplicate: boolean       // rationale ≥ threshold similar to a prior one
  reviewerAsn: number | null
  reviewerIpHash: string | null
}

/**
 * Compute the final weight and the per-factor audit record.
 *
 * Base weight follows the existing Phase 0 rule:
 *   IP match → 0.0, same ASN or priorMutual>1 → 0.5, else 1.0.
 *
 * Soft heuristics (fast submit, near-dup) multiply the base by
 * PEER_REVIEW_FLAG_WEIGHT_MULTIPLIER and set `flagged=true`. They never
 * push the weight to zero on their own.
 *
 * Agreement rate (0.5–1.0) multiplies in once the reviewer has history.
 * Skill match is recorded for audit but doesn't boost the weight — the panel
 * asked for it as an eligibility rule, not a bonus signal.
 */
export function buildWeightFactors(inputs: WeightInputs): PeerReviewWeightFactors {
  let base = 1.0
  if (inputs.sameIpHash) base = 0.0
  else if (inputs.sameAsn || inputs.priorMutual > 1) base = 0.5

  const flagged = inputs.fastSubmit || inputs.nearDuplicate
  const flagMultiplier = flagged ? env.PEER_REVIEW_FLAG_WEIGHT_MULTIPLIER : 1

  // Cold start (no expert overlap yet) is neutral at 1.0.
  // Otherwise map 0..1 agreement onto 0.5..1.0 so a poor reviewer is halved
  // but never zeroed on this signal alone.
  const agreement = inputs.agreementRate === null
    ? 1.0
    : 0.5 + 0.5 * inputs.agreementRate

  const final = Math.max(0, Math.min(1, base * flagMultiplier * agreement))

  return {
    base,
    skillMatch: inputs.skillMatched,
    agreementRate: inputs.agreementRate,
    cluster: inputs.reviewerAsn !== null
      ? `ASN#${inputs.reviewerAsn}`
      : `IP#${(inputs.reviewerIpHash ?? 'unknown').slice(0, 12)}`,
    fastSubmit: inputs.fastSubmit,
    nearDuplicate: inputs.nearDuplicate,
    flagged,
    final: Math.round(final * 100) / 100,
  }
}

// ─── Historical agreement with experts ──────────────────────────────────────

/**
 * Agreement rate: on credentials this reviewer peer-reviewed AND an expert
 * later ruled on, what fraction did the reviewer's APPROVE/FLAG agree with
 * the expert's confidence rating (≥3 = effectively "approve")? Returns null
 * when the reviewer has no overlapping history.
 */
export async function computeAgreementRate(reviewerId: string): Promise<number | null> {
  const past = await PeerReview.findAll({
    where: { reviewerId, status: { [Op.in]: ['SUBMITTED', 'FLAGGED'] } },
    attributes: ['credentialId', 'decision'],
  })
  if (past.length === 0) return null

  const credIds = past.map(r => r.credentialId)
  const experts = await ExpertReview.findAll({
    where: {
      credentialId: { [Op.in]: credIds },
      status: 'SUBMITTED',
      confidenceRating: { [Op.ne]: null },
    },
    attributes: ['credentialId', 'confidenceRating'],
  })
  if (experts.length === 0) return null

  const expertByCred = new Map(experts.map(e => [e.credentialId, e.confidenceRating ?? 0]))
  let agreed = 0
  let overlap = 0
  for (const review of past) {
    const rating = expertByCred.get(review.credentialId)
    if (rating === undefined) continue
    overlap++
    const reviewerApproved = review.decision === 'APPROVE'
    const expertApproved = rating >= 3
    if (reviewerApproved === expertApproved) agreed++
  }
  return overlap === 0 ? null : agreed / overlap
}

// ─── Assignment ─────────────────────────────────────────────────────────────

/**
 * System-assigns peer reviewers for a credential.
 *
 * Phase 1 integrity rules (see docs/PEER_REVIEW_INTEGRITY.md):
 *   - reviewer must pass `checkEligibility` (age, mutual cap, qualifying credential)
 *   - exclude the credential owner
 *   - aim for 3 reviewers total, drawn from developers then external peer_verifiers
 *   - weight factors are computed with only the *developer-side* IP/ASN at this stage;
 *     the reviewer-side fields are filled in on submit.
 */
export async function assignPeerReviewers(
  credentialId: string,
  developerId: string,
  currentLayer: number,
  credentialSkill: string,
  developerIpHash?: string,
  developerIp?: string,
): Promise<PeerReview[]> {
  if (currentLayer < 3) {
    throw new ValidationError(
      'Peer review requires at least Layer 3 (GitHub scan complete). Submit a GitHub repository first.'
    )
  }

  const existing = await PeerReview.count({ where: { credentialId } })
  if (existing >= 2) return []

  const candidates = await User.findAll({
    where: { role: 'developer', id: { [Op.ne]: developerId }, isActive: true },
    limit: 20,
    order: [['createdAt', 'ASC']],
  })
  const externalReviewers = await User.findAll({
    where: { role: 'peer_verifier', isActive: true },
    limit: 5,
  })

  const pool = [
    ...candidates.map(u => ({ user: u, type: 'internal' as const })),
    ...externalReviewers.map(u => ({ user: u, type: 'external' as const })),
  ]

  const alreadyAssigned = new Set(
    (await PeerReview.findAll({ where: { credentialId }, attributes: ['reviewer_id'] }))
      .map(r => r.reviewerId)
  )

  const now = new Date()
  const developerAsn = developerIp ? await lookupAsn(developerIp) : null
  const selected: Array<{ user: typeof pool[0]['user']; type: 'internal' | 'external'; skillMatched: boolean }> = []

  for (const c of pool) {
    if (alreadyAssigned.has(c.user.id)) continue
    const check = await checkEligibility(c.user.id, developerId, credentialSkill, now)
    if (!check.eligible) continue
    selected.push({ ...c, skillMatched: check.skillMatched })
    if (selected.length >= 3) break
  }

  if (selected.length === 0) return []

  const expiresAt = new Date(now.getTime() + REVIEW_WINDOW_DAYS * MS_PER_DAY)

  return Promise.all(selected.map(async ({ user, type, skillMatched }) => {
    const priorMutual = await PeerReview.count({
      where: { reviewerId: user.id, status: 'SUBMITTED' },
      include: [{ association: 'credential', attributes: ['id'], where: { developerId }, required: true }],
    })

    const factors = buildWeightFactors({
      sameIpHash: false,                 // reviewer IP unknown until submit
      sameAsn: developerAsn !== null && false, // unknown until submit
      priorMutual,
      skillMatched,
      agreementRate: null,               // computed at submit (uses full history)
      fastSubmit: false,
      nearDuplicate: false,
      reviewerAsn: null,
      reviewerIpHash: null,
    })

    return PeerReview.create({
      credentialId,
      reviewerId: user.id,
      reviewerType: type,
      status: 'ASSIGNED',
      decision: null,
      rationale: null,
      artifactUrl: null,
      rubric: null,
      weightFactor: factors.final,
      weightFactors: factors,
      reviewerIpHash: null,
      reviewerAsn: null,
      flagged: false,
      assignedAt: now,
      expiresAt,
    })
  }))
}
