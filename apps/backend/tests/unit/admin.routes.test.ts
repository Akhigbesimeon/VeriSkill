// Unit tests for admin.routes — exercises the user deactivate self/peer guard
// and the analytics aggregation. All models and auth are mocked; no DB.

import express from 'express'
import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import request from 'supertest'

// ─── Mocks (hoisted) ────────────────────────────────────────────────────────

jest.mock('../../src/config/sequelize', () => ({ __esModule: true, default: {} }))

// Auth middleware: inject a stub admin user, make requireRole a pass-through.
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = req.headers['x-test-user']
      ? JSON.parse(req.headers['x-test-user'] as string)
      : { id: 'admin-1', email: 'a@a', role: 'administrator' }
    next()
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  optionalAuthenticate: (_req: any, _res: any, next: any) => next(),
}))

// Simple model-store mocks.
const userStore: Record<string, { id: string; role: string; displayName: string; isActive: boolean; update: jest.Mock }> = {}
const auditCreate = jest.fn()

jest.mock('../../src/models/User', () => ({
  User: {
    findByPk: jest.fn(async (id: string) => userStore[id] ?? null),
    findAll:  jest.fn(async (opts: any) => {
      const rows = Object.values(userStore)
      // Analytics path uses `group: ['role']` + raw aggregate.
      if (opts?.group?.[0] === 'role') {
        const counts: Record<string, number> = {}
        for (const u of rows) if (u.isActive) counts[u.role] = (counts[u.role] ?? 0) + 1
        return Object.entries(counts).map(([role, count]) => ({ role, count: String(count) }))
      }
      // Users listing path.
      return rows.map(u => ({
        id: u.id, role: u.role, displayName: u.displayName,
        isActive: u.isActive, createdAt: new Date(),
      }))
    }),
    count: jest.fn(async (opts: any) => {
      if (opts?.where?.isActive === false) {
        return Object.values(userStore).filter(u => !u.isActive).length
      }
      return 0
    }),
  },
}))

jest.mock('../../src/models/Credential', () => ({
  Credential: {
    findAll: jest.fn(async (opts: any) => {
      if (opts?.group?.[0] === 'lifecycleStatus') return [{ lifecycleStatus: 'MINTED', count: '2' }]
      if (opts?.group?.[0] === 'verificationLayer') return [{ verificationLayer: 3, count: '5' }]
      if (opts?.group?.[0] === 'developerId') return []
      return []
    }),
    findByPk: jest.fn(),
  },
}))

jest.mock('../../src/models/PeerReview', () => ({
  PeerReview: {
    count:   jest.fn(async () => 1),
    findAll: jest.fn(async () => []),
  },
}))

jest.mock('../../src/models/AuditLog', () => ({
  AuditLog: {
    create:  jest.fn(async (p: any) => { auditCreate(p); return p }),
    findAll: jest.fn(async () => []),
  },
}))

jest.mock('../../src/services/blockchain.service', () => ({
  revokeOnChain: jest.fn(async () => undefined),
}))

// Short-circuit trust-score + expert-review services: their real modules load
// unmocked models (EvidenceUrl, GithubScan, ExpertReview, TrustScoreHistory)
// which call Model.init() against the mocked sequelize `{}` and blow up. No
// test case here hits /credentials/:id/recompute, the only caller.
jest.mock('../../src/services/trust-score.service', () => ({
  calculateTrustScore: jest.fn(async () => ({ score: 0, layer: 0 })),
}))
jest.mock('../../src/services/expert-review.service', () => ({
  assignExpertReviewers: jest.fn(async () => undefined),
}))

// ─── App setup ──────────────────────────────────────────────────────────────

function makeApp() {
  const { adminRouter } = require('../../src/routes/admin.routes')
  const { errorHandler } = require('../../src/middleware/error.middleware')
  const app = express()
  app.use(express.json())
  app.use('/admin', adminRouter)
  app.use(errorHandler)
  return app
}

function putUser(id: string, role: string, isActive = true): typeof userStore[string] {
  const u = {
    id, role, displayName: `User ${id}`, isActive,
    update: jest.fn(async function (this: any, patch: any) { Object.assign(this, patch); return this }),
  }
  userStore[id] = u
  return u
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('admin.routes — user deactivation guards', () => {
  beforeEach(() => {
    for (const k of Object.keys(userStore)) delete userStore[k]
    auditCreate.mockClear()
  })

  test('admin cannot deactivate their own account', async () => {
    putUser('admin-1', 'administrator')
    const res = await makeApp()
      ? await request(makeApp()).post('/admin/users/admin-1/deactivate')
      : null
    expect(res!.status).toBe(403)
    expect(res!.body.error).toMatch(/own account/i)
  })

  test('admin cannot deactivate another administrator', async () => {
    putUser('admin-2', 'administrator')
    const res = await request(makeApp()).post('/admin/users/admin-2/deactivate')
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/administrators/i)
  })

  test('admin can deactivate a developer and the user flips inactive', async () => {
    const dev = putUser('dev-1', 'developer')
    const res = await request(makeApp()).post('/admin/users/dev-1/deactivate')
    expect(res.status).toBe(200)
    expect(dev.update).toHaveBeenCalledWith({ isActive: false })
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.deactivated' }))
  })

  test('deactivating an already-inactive user returns 422', async () => {
    putUser('dev-2', 'developer', false)
    const res = await request(makeApp()).post('/admin/users/dev-2/deactivate')
    expect(res.status).toBe(422)
  })

  test('deactivating an unknown user returns 404', async () => {
    const res = await request(makeApp()).post('/admin/users/nope/deactivate')
    expect(res.status).toBe(404)
  })

  test('reactivate flips the user back on', async () => {
    const dev = putUser('dev-3', 'developer', false)
    const res = await request(makeApp()).post('/admin/users/dev-3/reactivate')
    expect(res.status).toBe(200)
    expect(dev.update).toHaveBeenCalledWith({ isActive: true })
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.reactivated' }))
  })
})

describe('admin.routes — analytics', () => {
  beforeEach(() => {
    for (const k of Object.keys(userStore)) delete userStore[k]
  })

  test('returns aggregated counts and no PII', async () => {
    putUser('u1', 'developer')
    putUser('u2', 'developer')
    putUser('u3', 'administrator')
    putUser('u4', 'developer', false)

    const res = await request(makeApp()).get('/admin/analytics')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(expect.objectContaining({
      usersByRole:         { developer: 2, administrator: 1 },
      credentialsByStatus: { MINTED: 2 },
      credentialsByLayer:  { 3: 5 },
      flaggedPeerReviews:  1,
      deactivatedUsers:    1,
    }))
    // Sanity: payload must not contain emails or wallet addresses.
    expect(JSON.stringify(res.body)).not.toMatch(/@/)
    expect(JSON.stringify(res.body)).not.toMatch(/wallet/i)
  })
})
