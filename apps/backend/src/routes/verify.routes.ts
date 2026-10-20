import { Router } from 'express'
import { Op } from 'sequelize'
import { Credential } from '../models/Credential'
import { User } from '../models/User'
import { AuditLog } from '../models/AuditLog'
import { NotFoundError } from '../middleware/error.middleware'
import { authenticate, requireRole, optionalAuthenticate } from '../middleware/auth.middleware'

export const verifyRouter = Router()

const SAVE_ACTIONS = ['candidate.saved', 'candidate.unsaved'] as const

/**
 * GET /api/v1/verify/stats — recruiter scan analytics.
 */
verifyRouter.get('/stats', authenticate, requireRole('recruiter'), async (req, res, next) => {
  try {
    const where = { actorId: req.user!.id, action: 'credential.verified', resourceType: 'credential' }
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [totalScans, uniqueCandidates, scansThisMonth] = await Promise.all([
      AuditLog.count({ where }),
      AuditLog.count({ where, distinct: true, col: 'resource_id' }),
      AuditLog.count({ where: { ...where, createdAt: { [Op.gte]: startOfMonth } } }),
    ])

    res.json({ totalScans, uniqueCandidates, scansThisMonth })
  } catch (err) { next(err) }
})

/**
 * GET /api/v1/verify/activity?days=30 — per-day scan counts for a sparkline.
 */
verifyRouter.get('/activity', authenticate, requireRole('recruiter'), async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30))
    const since = new Date()
    since.setHours(0, 0, 0, 0)
    since.setDate(since.getDate() - (days - 1))

    const events = await AuditLog.findAll({
      where: {
        actorId:      req.user!.id,
        action:       'credential.verified',
        resourceType: 'credential',
        createdAt:    { [Op.gte]: since },
      },
      attributes: ['createdAt'],
    })

    const counts = new Map<string, number>()
    for (let i = 0; i < days; i++) {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      counts.set(d.toISOString().slice(0, 10), 0)
    }
    for (const e of events) {
      const key = e.createdAt.toISOString().slice(0, 10)
      if (counts.has(key)) counts.set(key, counts.get(key)! + 1)
    }

    res.json([...counts.entries()].map(([date, count]) => ({ date, count })))
  } catch (err) { next(err) }
})

/**
 * GET /api/v1/verify/recent — recruiter scan history (last 10).
 */
verifyRouter.get('/recent', authenticate, requireRole('recruiter'), async (req, res, next) => {
  try {
    const rows = await AuditLog.findAll({
      where: { actorId: req.user!.id, action: 'credential.verified', resourceType: 'credential' },
      order: [['createdAt', 'DESC']],
      limit: 10,
    })
    if (rows.length === 0) return res.json([])

    const credentials = await Credential.findAll({
      where: { id: rows.map(r => r.resourceId) },
      include: [{ model: User, as: 'developer', attributes: ['displayName'] }],
    })
    const byId = new Map(credentials.map(c => [c.id, c]))

    res.json(rows.flatMap(r => {
      const c = byId.get(r.resourceId)
      if (!c) return []
      return [{
        id:                c.id,
        skill:             c.skill,
        verificationLayer: c.verificationLayer,
        trustScore:        c.trustScore,
        developer:         { displayName: (c as any).developer?.displayName ?? null },
        scannedAt:         r.createdAt,
      }]
    }))
  } catch (err) { next(err) }
})

/**
 * GET /api/v1/verify/saved — recruiter's currently-saved candidates.
 *
 * Save/unsave is encoded as append-only AuditLog events; the latest event per
 * credential wins. For a prototype feature this JS group-by is fine; if save
 * volume grows past a few thousand per recruiter, swap for a dedicated table
 * or a `DISTINCT ON (resource_id)` SQL subquery.
 */
verifyRouter.get('/saved', authenticate, requireRole('recruiter'), async (req, res, next) => {
  try {
    const events = await AuditLog.findAll({
      where: {
        actorId:      req.user!.id,
        resourceType: 'credential',
        action:       { [Op.in]: SAVE_ACTIONS as unknown as string[] },
      },
      order: [['createdAt', 'DESC']],
    })

    const seen    = new Set<string>()
    const savedIds: string[] = []
    for (const e of events) {
      if (seen.has(e.resourceId)) continue
      seen.add(e.resourceId)
      if (e.action === 'candidate.saved') savedIds.push(e.resourceId)
    }
    if (savedIds.length === 0) return res.json([])

    const credentials = await Credential.findAll({
      where: { id: savedIds, lifecycleStatus: 'MINTED' },
      include: [{ model: User, as: 'developer', attributes: ['displayName'] }],
    })

    res.json(credentials.map(c => ({
      id:                c.id,
      skill:             c.skill,
      verificationLayer: c.verificationLayer,
      trustScore:        c.trustScore,
      developer:         { displayName: (c as any).developer?.displayName ?? null },
    })))
  } catch (err) { next(err) }
})

/**
 * GET /api/v1/verify/search?q=<string> — recruiter candidate search.
 *
 * Searches developers by displayName / email. Recruiter-only to avoid turning
 * a public endpoint into a user enumeration surface. Returns at most 20 rows,
 * each with the developer's three most recent MINTED credentials.
 */
verifyRouter.get('/search', authenticate, requireRole('recruiter'), async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) return res.json([])
    const like = `%${q.replace(/[%_]/g, m => `\\${m}`)}%`

    const developers = await User.findAll({
      where: {
        role:     'developer',
        isActive: true,
        [Op.or]: [
          { displayName: { [Op.iLike]: like } },
          { email:       { [Op.iLike]: like } },
        ],
      },
      attributes: ['id', 'displayName', 'email'],
      limit: 20,
    })
    if (developers.length === 0) return res.json([])

    const creds = await Credential.findAll({
      where: {
        developerId:     developers.map(d => d.id),
        lifecycleStatus: 'MINTED',
      },
      order: [['createdAt', 'DESC']],
    })
    const byDev = new Map<string, { id: string; skill: string; verificationLayer: number; trustScore: number }[]>()
    for (const c of creds) {
      const list = byDev.get((c as any).developerId) ?? []
      if (list.length < 3) list.push({
        id: c.id, skill: c.skill,
        verificationLayer: c.verificationLayer, trustScore: c.trustScore,
      })
      byDev.set((c as any).developerId, list)
    }

    res.json(developers.map(d => ({
      id:          d.id,
      displayName: d.displayName,
      email:       d.email,
      credentials: byDev.get(d.id) ?? [],
    })))
  } catch (err) { next(err) }
})

/**
 * GET /api/v1/verify/export — CSV of the recruiter's scan history.
 */
verifyRouter.get('/export', authenticate, requireRole('recruiter'), async (req, res, next) => {
  try {
    const events = await AuditLog.findAll({
      where: { actorId: req.user!.id, action: 'credential.verified', resourceType: 'credential' },
      order: [['createdAt', 'DESC']],
    })

    const creds = events.length === 0 ? [] : await Credential.findAll({
      where: { id: events.map(e => e.resourceId) },
      include: [{ model: User, as: 'developer', attributes: ['displayName', 'email'] }],
    })
    const byId = new Map(creds.map(c => [c.id, c]))

    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows: string[] = ['scannedAt,candidate,email,skill,layer,trustScore,credentialId']
    for (const e of events) {
      const c = byId.get(e.resourceId) as any
      if (!c) continue
      rows.push([
        e.createdAt.toISOString(),
        esc(c.developer?.displayName ?? ''),
        esc(c.developer?.email ?? ''),
        esc(c.skill),
        c.verificationLayer,
        c.trustScore,
        c.id,
      ].join(','))
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="veriskill-scans-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(rows.join('\n'))
  } catch (err) { next(err) }
})

/**
 * POST /api/v1/verify/:id/save — bookmark a candidate (recruiter).
 */
verifyRouter.post('/:id/save', authenticate, requireRole('recruiter'), async (req, res, next) => {
  try {
    const credential = await Credential.findByPk(req.params.id)
    if (!credential || credential.lifecycleStatus !== 'MINTED') {
      throw new NotFoundError('Credential not found or not yet verified')
    }
    await AuditLog.create({
      actorId:      req.user!.id,
      action:       'candidate.saved',
      resourceType: 'credential',
      resourceId:   credential.id,
    })
    res.status(201).json({ saved: true })
  } catch (err) { next(err) }
})

/**
 * DELETE /api/v1/verify/:id/save — remove bookmark (recruiter).
 */
verifyRouter.delete('/:id/save', authenticate, requireRole('recruiter'), async (req, res, next) => {
  try {
    await AuditLog.create({
      actorId:      req.user!.id,
      action:       'candidate.unsaved',
      resourceType: 'credential',
      resourceId:   req.params.id,
    })
    res.json({ saved: false })
  } catch (err) { next(err) }
})

/**
 * GET /api/v1/verify/:id — public credential verification (optional auth).
 *
 * MINTED credentials only. Developer displayName is public (ADR-008). Email is
 * exposed ONLY to authenticated recruiters so they can initiate contact. Other
 * MINTED credentials by the same developer are included for drill-through —
 * these are already public on-chain. Scans by recruiters are logged.
 */
verifyRouter.get('/:id', optionalAuthenticate, async (req, res, next) => {
  try {
    const credential = await Credential.findByPk(req.params.id, {
      include: [{ model: User, as: 'developer', attributes: ['id', 'displayName', 'email'] }],
    })

    if (!credential || credential.lifecycleStatus !== 'MINTED') {
      throw new NotFoundError('Credential not found or not yet verified')
    }

    const developer = (credential as any).developer as { id: string; displayName: string | null; email: string | null } | null
    const isRecruiter = req.user?.role === 'recruiter'

    const verified =
      !!credential.tokenId &&
      !!credential.commitHash &&
      !!credential.onChainMintedAt

    if (isRecruiter) {
      AuditLog.create({
        actorId:      req.user!.id,
        action:       'credential.verified',
        resourceType: 'credential',
        resourceId:   credential.id,
      }).catch(() => {})
    }

    // Other credentials by the same developer (public — already on-chain)
    const others = developer ? await Credential.findAll({
      where: {
        developerId:     developer.id,
        lifecycleStatus: 'MINTED',
        id:              { [Op.ne]: credential.id },
      },
      order: [['createdAt', 'DESC']],
      limit: 5,
    }) : []

    // Saved status (recruiter only)
    let saved = false
    if (isRecruiter) {
      const latest = await AuditLog.findOne({
        where: {
          actorId:      req.user!.id,
          resourceType: 'credential',
          resourceId:   credential.id,
          action:       { [Op.in]: SAVE_ACTIONS as unknown as string[] },
        },
        order: [['createdAt', 'DESC']],
      })
      saved = latest?.action === 'candidate.saved'
    }

    res.json({
      id:                credential.id,
      skill:             credential.skill,
      verificationLayer: credential.verificationLayer,
      trustScore:        credential.trustScore,
      lifecycleStatus:   credential.lifecycleStatus,
      tokenId:           credential.tokenId,
      commitHash:        credential.commitHash,
      onChainMintedAt:   credential.onChainMintedAt,
      developer: {
        displayName: developer?.displayName ?? null,
        email:       isRecruiter ? (developer?.email ?? null) : undefined,
        credentials: others.map(o => ({
          id: o.id, skill: o.skill,
          verificationLayer: o.verificationLayer, trustScore: o.trustScore,
        })),
      },
      verified,
      saved: isRecruiter ? saved : undefined,
    })
  } catch (err) { next(err) }
})
