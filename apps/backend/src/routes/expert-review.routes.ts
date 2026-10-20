import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.middleware'
import { NotFoundError, validate } from '../middleware/error.middleware'
import { ExpertReview } from '../models/ExpertReview'
import { Credential } from '../models/Credential'
import { calculateTrustScore } from '../services/trust-score.service'

export const expertReviewRouter = Router()
expertReviewRouter.use(authenticate)

const submitSchema = z.object({
  confidenceRating: z.number().int().min(1).max(5),
  notes: z.string().min(20, 'Notes must be at least 20 characters').max(2000),
})

/** GET /api/v1/expert-reviews — list reviews assigned to this expert */
expertReviewRouter.get('/', requireRole('expert_verifier'), async (req, res, next) => {
  try {
    const reviews = await ExpertReview.findAll({
      where: { expertId: req.user!.id, status: 'ASSIGNED' },
      include: [{ model: Credential, as: 'credential' }],
    })
    res.json(reviews)
  } catch (err) { next(err) }
})

/** GET /api/v1/expert-reviews/history — reviews this expert has already submitted */
expertReviewRouter.get('/history', requireRole('expert_verifier'), async (req, res, next) => {
  try {
    const reviews = await ExpertReview.findAll({
      where: { expertId: req.user!.id, status: 'SUBMITTED' },
      include: [{ model: Credential, as: 'credential' }],
      order: [['submittedAt', 'DESC']],
    })
    res.json(reviews)
  } catch (err) { next(err) }
})

/** POST /api/v1/expert-reviews/:id/submit — submit a confidence rating */
expertReviewRouter.post('/:id/submit', requireRole('expert_verifier'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validate(submitSchema, req.body)

    const review = await ExpertReview.findOne({
      where: { id: req.params.id, expertId: req.user!.id, status: 'ASSIGNED' },
    })
    if (!review) throw new NotFoundError('Review not found or already submitted')

    await review.update({
      confidenceRating: input.confidenceRating,
      notes: input.notes,
      status: 'SUBMITTED',
      submittedAt: new Date(),
    })

    await calculateTrustScore(review.credentialId)

    res.json({ message: 'Review submitted', review })
  } catch (err) { next(err) }
})
