import { Router, Request, Response, NextFunction } from 'express'
import { Op } from 'sequelize'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.middleware'
import { ValidationError, NotFoundError, validate } from '../middleware/error.middleware'
import { PeerReview } from '../models/PeerReview'
import { Credential } from '../models/Credential'
import { calculateTrustScore } from '../services/trust-score.service'
import { hashIp } from '../services/peer-review.service'
import { assignExpertReviewers } from '../services/expert-review.service'

export const peerReviewRouter = Router()
peerReviewRouter.use(authenticate)

const submitSchema = z.object({
  decision: z.enum(['APPROVE', 'FLAG']),
  rationale: z.string().min(20, 'Rationale must be at least 20 characters').max(2000),
})

/** GET /api/v1/peer-reviews — list reviews assigned to this reviewer */
peerReviewRouter.get('/', requireRole('developer', 'peer_verifier'), async (req, res, next) => {
  try {
    const reviews = await PeerReview.findAll({
      where: { reviewerId: req.user!.id, status: 'ASSIGNED' },
      include: [{ model: Credential, as: 'credential' }],
    })
    res.json(reviews)
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
    res.json(reviews)
  } catch (err) { next(err) }
})

/** POST /api/v1/peer-reviews/:id/submit — submit a review decision */
peerReviewRouter.post('/:id/submit', requireRole('developer', 'peer_verifier'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validate(submitSchema, req.body)

    const review = await PeerReview.findOne({
      where: { id: req.params.id, reviewerId: req.user!.id, status: 'ASSIGNED' }
    })
    if (!review) throw new NotFoundError('Review not found or already submitted')

    if (review.expiresAt < new Date()) {
      await review.update({ status: 'EXPIRED' })
      throw new ValidationError('Review window has expired')
    }

    const reviewerIpHash = hashIp(req.ip ?? req.socket.remoteAddress ?? '')

    await review.update({
      decision: input.decision,
      rationale: input.rationale,
      status: input.decision === 'FLAG' ? 'FLAGGED' : 'SUBMITTED',
      reviewerIpHash,
      submittedAt: new Date(),
    })

    const { layer } = await calculateTrustScore(review.credentialId)

    // Promote to expert review once Layer 5 is reached (idempotent).
    if (layer >= 5) {
      const credential = await Credential.findByPk(review.credentialId, { attributes: ['developerId'] })
      if (credential) await assignExpertReviewers(review.credentialId, credential.developerId)
    }

    res.json({ message: 'Review submitted', review })
  } catch (err) { next(err) }
})
