import { Router, Request, Response, NextFunction } from 'express'
import { Op } from 'sequelize'
import { authenticate, requireRole } from '../middleware/auth.middleware'
import { ValidationError, NotFoundError, ForbiddenError, validate } from '../middleware/error.middleware'
import { PeerReview } from '../models/PeerReview'
import { Credential } from '../models/Credential'
import { env } from '../config/env'
import { calculateTrustScore } from '../services/trust-score.service'
import {
  hashIp,
  lookupAsn,
  buildWeightFactors,
  computeAgreementRate,
  textFingerprint,
  maxSimilarity,
} from '../services/peer-review.service'
import { assignExpertReviewers } from '../services/expert-review.service'
import { peerReviewSubmitSchema } from '@veriskill/shared'

export const peerReviewRouter = Router()
peerReviewRouter.use(authenticate)

/**
 * Strip developer identity from a Credential before handing it to the reviewer.
 * Blinding is best-effort: the GitHub URL is intentionally preserved because
 * it is the artifact being reviewed; see docs/PEER_REVIEW_INTEGRITY.md.
 */
function blindCredential(cred: Credential): Record<string, unknown> {
  const json = cred.toJSON() as unknown as Record<string, unknown>
  delete json.developerId
  delete json.developer
  delete json.developer_id
  return json
}

function blindReview(review: PeerReview): Record<string, unknown> {
  const json = review.toJSON() as unknown as Record<string, unknown>
  if (json.credential) {
    json.credential = blindCredential(review.get('credential') as Credential)
  }
  // weightFactors is admin-only; never leak the audit record back to the reviewer.
  delete json.weightFactors
  delete json.weight_factors
  return json
}

const ALLOWED_ARTIFACT_HOSTS = new Set(['github.com', 'www.github.com', 'gist.github.com'])

function validateArtifactUrl(url: string): void {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new ValidationError('artifactUrl is not a valid URL') }
  if (!ALLOWED_ARTIFACT_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new ValidationError('artifactUrl must point to a GitHub repository, commit, file, or gist')
  }
  // Reject the bare domain / user profile — needs at least /owner/repo or /gist/id.
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new ValidationError('artifactUrl must reference a specific repository, commit, file, or gist')
  }
}

/** GET /api/v1/peer-reviews — list reviews assigned to this reviewer (blinded) */
peerReviewRouter.get('/', requireRole('developer', 'peer_verifier'), async (req, res, next) => {
  try {
    const reviews = await PeerReview.findAll({
      where: { reviewerId: req.user!.id, status: 'ASSIGNED' },
      include: [{ model: Credential, as: 'credential' }],
    })
    res.json(reviews.map(blindReview))
  } catch (err) { next(err) }
})

/** GET /api/v1/peer-reviews/history — reviews this reviewer has already submitted (or flagged) */
peerReviewRouter.get('/history', requireRole('developer', 'peer_verifier'), async (req, res, next) => {
  try {
    const reviews = await PeerReview.findAll({
      where: { reviewerId: req.user!.id, status: { [Op.in]: ['SUBMITTED', 'FLAGGED'] } },
      include: [{ model: Credential, as: 'credential' }],
      order: [['submittedAt', 'DESC']],
    })
    res.json(reviews.map(blindReview))
  } catch (err) { next(err) }
})

/** POST /api/v1/peer-reviews/:id/submit — submit a review decision */
peerReviewRouter.post('/:id/submit', requireRole('developer', 'peer_verifier'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validate(peerReviewSubmitSchema, req.body)
    validateArtifactUrl(input.artifactUrl)

    const review = await PeerReview.findOne({
      where: { id: req.params.id, reviewerId: req.user!.id, status: 'ASSIGNED' }
    })
    if (!review) throw new NotFoundError('Review not found or already submitted')

    if (review.expiresAt < new Date()) {
      await review.update({ status: 'EXPIRED' })
      throw new ValidationError('Review window has expired')
    }

    // Defence in depth — assignment already excludes the owner, but a bad
    // state (DB-inserted row, stale assignment) would otherwise let self-review in.
    const credential = await Credential.findByPk(review.credentialId, {
      attributes: ['id', 'developerId', 'skill'],
    })
    if (!credential) throw new NotFoundError('Credential not found')
    if (credential.developerId === req.user!.id) {
      throw new ForbiddenError('You cannot review your own credential')
    }

    const now = new Date()
    const reviewerIp = req.ip ?? req.socket.remoteAddress ?? ''
    const reviewerIpHash = hashIp(reviewerIp)
    const reviewerAsn = await lookupAsn(reviewerIp)

    // Collect this reviewer's prior rationales for duplicate detection.
    const priorSubmissions = await PeerReview.findAll({
      where: {
        reviewerId: req.user!.id,
        status: { [Op.in]: ['SUBMITTED', 'FLAGGED'] },
        rationale: { [Op.ne]: null },
        id: { [Op.ne]: review.id },
      },
      attributes: ['rationale'],
      order: [['submittedAt', 'DESC']],
      limit: env.PEER_REVIEW_DUP_HISTORY_LIMIT,
    })
    const priorTexts = priorSubmissions.map(r => r.rationale as string)

    // Exact duplicate = hard reject. Near-dup = soft flag (handled below).
    const incomingFingerprint = textFingerprint(input.rationale)
    const exactDup = priorTexts.some(t => textFingerprint(t) === incomingFingerprint)
    if (exactDup) {
      throw new ValidationError('This rationale is identical to one you have already submitted')
    }
    const similarity = maxSimilarity(input.rationale, priorTexts)
    const nearDuplicate = similarity >= env.PEER_REVIEW_DUP_SHINGLE_THRESHOLD

    const assignedAt = new Date(review.assignedAt)
    const elapsedSeconds = (now.getTime() - assignedAt.getTime()) / 1000
    const fastSubmit = elapsedSeconds < env.PEER_REVIEW_FAST_SUBMIT_SECONDS

    // Load developer IP for anti-collusion comparison.
    // shortcut: credentials don't currently store a developer IP hash, so the
    // IP-match branch only fires when peer reviews already exist that recorded
    // the developer side. Upgrade by persisting developerIpHash on the credential.
    const [prior] = await PeerReview.findAll({
      where: { credentialId: credential.id, reviewerId: credential.developerId },
      attributes: ['reviewerIpHash', 'reviewerAsn'],
      limit: 1,
    })
    const developerIpHash = prior?.reviewerIpHash ?? null
    const developerAsn = prior?.reviewerAsn ?? null

    // Historical agreement with experts, pre-submit so the current review
    // doesn't count in its own agreement rate.
    const agreementRate = await computeAgreementRate(req.user!.id)

    const priorMutual = await PeerReview.count({
      where: { reviewerId: req.user!.id, status: 'SUBMITTED' },
      include: [{ association: 'credential', attributes: ['id'], where: { developerId: credential.developerId }, required: true }],
    })

    const priorFactors = review.weightFactors ?? null
    const factors = buildWeightFactors({
      sameIpHash: developerIpHash !== null && developerIpHash === reviewerIpHash,
      sameAsn: developerAsn !== null && reviewerAsn !== null && developerAsn === reviewerAsn,
      priorMutual,
      skillMatched: priorFactors?.skillMatch ?? false,
      agreementRate,
      fastSubmit,
      nearDuplicate,
      reviewerAsn,
      reviewerIpHash,
    })

    const flagged = factors.flagged || input.decision === 'FLAG'
    // FLAG decision → always FLAGGED status; otherwise SUBMITTED even when the
    // soft heuristic tripped — the soft flag only lowers the weight.
    const status = input.decision === 'FLAG' ? 'FLAGGED' : 'SUBMITTED'

    await review.update({
      decision: input.decision,
      rationale: input.rationale,
      artifactUrl: input.artifactUrl,
      rubric: input.rubric,
      weightFactor: factors.final,
      weightFactors: factors,
      reviewerIpHash,
      reviewerAsn,
      flagged,
      status,
      submittedAt: now,
    })

    const { layer } = await calculateTrustScore(review.credentialId)

    // Escalate to expert review when (a) Layer 5 reached OR (b) this submission
    // is flagged — a flagged review on its own should pull expert eyes even if
    // the credential hasn't hit Layer 5 yet.
    if (layer >= 5 || flagged) {
      await assignExpertReviewers(review.credentialId, credential.developerId)
    }

    res.json({ message: 'Review submitted', review: blindReview(review) })
  } catch (err) { next(err) }
})

// Used by the simulation script and tests that want to probe allowed hosts
// without going through the full router.
export const __test = { validateArtifactUrl, blindCredential, blindReview }
