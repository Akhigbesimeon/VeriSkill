import { Op } from 'sequelize'
import { User } from '../models/User'
import { ExpertReview } from '../models/ExpertReview'

const EXPERT_TARGET = 3

/**
 * System-assigns expert reviewers for a credential once it reaches Layer 5
 * (3+ weighted peer approvals). Idempotent: no-op if any expert reviews
 * already exist for the credential.
 *
 * Selection: oldest-active users with role 'expert_verifier', excluding the
 * credential owner. No anti-collusion weighting — experts are the trust
 * ceiling and are vetted off-platform.
 */
export async function assignExpertReviewers(
  credentialId: string,
  developerId: string
): Promise<ExpertReview[]> {
  const existing = await ExpertReview.count({ where: { credentialId } })
  if (existing > 0) return []

  const experts = await User.findAll({
    where: {
      role: 'expert_verifier',
      id: { [Op.ne]: developerId },
      isActive: true,
    },
    limit: EXPERT_TARGET,
    order: [['createdAt', 'ASC']],
  })

  if (experts.length === 0) return []

  return Promise.all(experts.map(user =>
    ExpertReview.create({
      credentialId,
      expertId: user.id,
      status: 'ASSIGNED',
      confidenceRating: null,
      notes: null,
      assignedAt: new Date(),
    })
  ))
}
