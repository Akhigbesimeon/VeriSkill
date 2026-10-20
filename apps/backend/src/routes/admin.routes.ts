import { Router, Request, Response, NextFunction } from 'express'
import { fn, col } from 'sequelize'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { authenticate, requireRole } from '../middleware/auth.middleware'
import { NotFoundError, ForbiddenError, ValidationError, ConflictError, validate } from '../middleware/error.middleware'
import { Credential } from '../models/Credential'
import { User } from '../models/User'
import { AuditLog } from '../models/AuditLog'
import { PeerReview } from '../models/PeerReview'
import { revokeOnChain } from '../services/blockchain.service'
import { calculateTrustScore } from '../services/trust-score.service'
import { assignExpertReviewers } from '../services/expert-review.service'

export const adminRouter = Router()
adminRouter.use(authenticate, requireRole('administrator'))

/**
 * GET /api/v1/admin/analytics — site-wide operational counts for the admin
 * landing page. Deliberately returns no personal data (no names, emails, or
 * IPs); only aggregates by role / status / layer.
 */
adminRouter.get('/analytics', async (_req, res, next) => {
  try {
    const [usersByRole, credentialsByStatus, credentialsByLayer, flaggedReviews, deactivatedUsers] =
      await Promise.all([
        User.findAll({
          attributes: ['role', [fn('COUNT', col('id')), 'count']],
          where: { isActive: true },
          group: ['role'],
          raw: true,
        }) as unknown as Array<{ role: string; count: string }>,
        Credential.findAll({
          attributes: ['lifecycleStatus', [fn('COUNT', col('id')), 'count']],
          group: ['lifecycleStatus'],
          raw: true,
        }) as unknown as Array<{ lifecycleStatus: string; count: string }>,
        Credential.findAll({
          attributes: ['verificationLayer', [fn('COUNT', col('id')), 'count']],
          group: ['verificationLayer'],
          raw: true,
        }) as unknown as Array<{ verificationLayer: number; count: string }>,
        PeerReview.count({ where: { status: 'FLAGGED' } }),
        User.count({ where: { isActive: false } }),
      ])

    res.json({
      usersByRole:         Object.fromEntries(usersByRole.map(r => [r.role, Number(r.count)])),
      credentialsByStatus: Object.fromEntries(credentialsByStatus.map(r => [r.lifecycleStatus, Number(r.count)])),
      credentialsByLayer:  Object.fromEntries(credentialsByLayer.map(r => [r.verificationLayer, Number(r.count)])),
      flaggedPeerReviews:  flaggedReviews,
      deactivatedUsers,
    })
  } catch (err) { next(err) }
})

/**
 * GET /api/v1/admin/users — directory of users for moderation. Email and
 * walletAddress are intentionally omitted (PII). Admin sees only what's needed
 * to make a trust decision: role, display name, active flag, join date, and
 * counts of flags against them.
 */
adminRouter.get('/users', async (req, res, next) => {
  try {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined
    const where: Record<string, unknown> = {}
    if (role) where.role = role

    const users = await User.findAll({
      where,
      attributes: ['id', 'role', 'displayName', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 200,
    })

    // Count credentials and flagged reviews per developer. Low volume so a
    // JS group-by over flagged rows is cheaper than a nested-group SQL query.
    const ids = users.map(u => u.id)
    const [credCounts, flaggedRows] = ids.length === 0 ? [[], []] : await Promise.all([
      Credential.findAll({
        attributes: ['developerId', [fn('COUNT', col('id')), 'count']],
        where: { developerId: ids },
        group: ['developerId'],
        raw: true,
      }) as unknown as Array<{ developerId: string; count: string }>,
      PeerReview.findAll({
        where: { status: 'FLAGGED' },
        include: [{ association: 'credential', attributes: ['developerId'] }],
      }),
    ])

    const credsBy = new Map(credCounts.map(r => [r.developerId, Number(r.count)]))
    const flagsBy = new Map<string, number>()
    for (const row of flaggedRows) {
      const devId = (row as any).credential?.developerId
      if (devId) flagsBy.set(devId, (flagsBy.get(devId) ?? 0) + 1)
    }

    res.json(users.map(u => ({
      id:            u.id,
      role:          u.role,
      displayName:   u.displayName,
      isActive:      u.isActive,
      createdAt:     u.createdAt,
      credentialCount: credsBy.get(u.id) ?? 0,
      flagsAgainst:    flagsBy.get(u.id) ?? 0,
    })))
  } catch (err) { next(err) }
})

const createUserSchema = z.object({
  email:       z.string().email(),
  password:    z.string().min(8).max(200)
    .regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
  displayName: z.string().min(2).max(100),
  role:        z.enum(['expert_verifier', 'administrator', 'peer_verifier']),
})

/**
 * POST /api/v1/admin/users — create a privileged user (expert, admin, peer verifier).
 * Public registration is locked to developer/recruiter; this is the only path for
 * the other roles. New users sign in with the temp password and should change it.
 */
adminRouter.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validate(createUserSchema, req.body)

    const email = input.email.toLowerCase()
    const existing = await User.findOne({ where: { email } })
    if (existing) throw new ConflictError('An account with this email already exists')

    const passwordHash = await bcrypt.hash(input.password, 12)
    const user = await User.create({
      email,
      passwordHash,
      role:          input.role,
      displayName:   input.displayName,
      walletType:    'managed',
      walletAddress: null,
      bio:           null,
      location:      null,
      externalLinks: [],
    })

    await AuditLog.create({
      actorId:      req.user!.id,
      action:       'user.created',
      resourceType: 'user',
      resourceId:   user.id,
      payload:      { role: user.role },
    })

    res.status(201).json({
      user: {
        id:          user.id,
        email:       user.email,
        role:        user.role,
        displayName: user.displayName,
        isActive:    user.isActive,
      },
    })
  } catch (err) { next(err) }
})

/** POST /api/v1/admin/users/:id/deactivate — revoke a user's site access */
adminRouter.post('/users/:id/deactivate', async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) {
      throw new ForbiddenError('You cannot deactivate your own account')
    }
    const user = await User.findByPk(req.params.id)
    if (!user) throw new NotFoundError('User not found')
    if (user.role === 'administrator') {
      throw new ForbiddenError('Administrators cannot be deactivated through this endpoint')
    }
    if (!user.isActive) throw new ValidationError('User is already deactivated')

    await user.update({ isActive: false })
    await AuditLog.create({
      actorId:      req.user!.id,
      action:       'user.deactivated',
      resourceType: 'user',
      resourceId:   user.id,
      payload:      { role: user.role },
    })
    res.json({ message: 'User deactivated' })
  } catch (err) { next(err) }
})

/** POST /api/v1/admin/users/:id/reactivate — restore site access */
adminRouter.post('/users/:id/reactivate', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id)
    if (!user) throw new NotFoundError('User not found')
    if (user.isActive) throw new ValidationError('User is already active')

    await user.update({ isActive: true })
    await AuditLog.create({
      actorId:      req.user!.id,
      action:       'user.reactivated',
      resourceType: 'user',
      resourceId:   user.id,
      payload:      { role: user.role },
    })
    res.json({ message: 'User reactivated' })
  } catch (err) { next(err) }
})

/**
 * GET /api/v1/admin/credentials — moderation list. Developer identity is the
 * displayName only; emails and wallet addresses are deliberately excluded so
 * the admin screen is not a PII leak surface.
 */
adminRouter.get('/credentials', async (_req, res, next) => {
  try {
    const credentials = await Credential.findAll({
      include: [{ model: User, as: 'developer', attributes: ['id', 'displayName'] }],
      order: [['createdAt', 'DESC']],
    })
    res.json(credentials)
  } catch (err) { next(err) }
})

/** POST /api/v1/admin/credentials/:id/revoke — revoke on-chain */
adminRouter.post('/credentials/:id/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await revokeOnChain(req.params.id, req.user!.id)
    res.json({ message: 'Credential revoked' })
  } catch (err) { next(err) }
})

/**
 * POST /api/v1/admin/credentials/:id/recompute — rerun trust-score + expert
 * assignment. Useful when the credential ended up in a stale state (e.g.
 * experts created after Layer 5 was reached, or test data inserted directly).
 */
adminRouter.post('/credentials/:id/recompute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const credential = await Credential.findByPk(req.params.id)
    if (!credential) throw new NotFoundError('Credential not found')

    const { score, layer } = await calculateTrustScore(credential.id)
    if (layer >= 5) await assignExpertReviewers(credential.id, credential.developerId)

    await AuditLog.create({
      actorId:      req.user!.id,
      action:       'credential.recomputed',
      resourceType: 'credential',
      resourceId:   credential.id,
      payload:      { score, layer },
    })

    res.json({ message: 'Recomputed', score, layer })
  } catch (err) { next(err) }
})

/** POST /api/v1/admin/credentials/:id/suspend — suspend (off-chain status only) */
adminRouter.post('/credentials/:id/suspend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const credential = await Credential.findByPk(req.params.id)
    if (!credential) throw new NotFoundError('Credential not found')
    await credential.update({ lifecycleStatus: 'SUSPENDED' })
    await AuditLog.create({
      actorId: req.user!.id,
      action: 'credential.suspended',
      resourceType: 'credential',
      resourceId: req.params.id,
      payload: {},
    })
    res.json({ message: 'Credential suspended' })
  } catch (err) { next(err) }
})

/** GET /api/v1/admin/audit-logs — recent audit log */
adminRouter.get('/audit-logs', async (_req, res, next) => {
  try {
    const logs = await AuditLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 200,
    })
    res.json(logs)
  } catch (err) { next(err) }
})
