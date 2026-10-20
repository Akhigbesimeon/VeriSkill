import { beforeEach, describe, expect, jest, test } from '@jest/globals'

// Unit test for trust-score.service — focuses on the persistence bug fix:
// calculateTrustScore must write {trustScore, verificationLayer} back to the
// Credential row (previously it only wrote to TrustScoreHistory).

// ─── Mocks ──────────────────────────────────────────────────────────────────
// All of these are hoisted by jest ahead of the service import below.

jest.mock('../../src/config/sequelize', () => ({
  __esModule: true,
  default: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}))

const credentialUpdate = jest.fn()
const historyCreate    = jest.fn()

type MockCredential = {
  id: string
  trustScore: number
  verificationLayer: number
  update: jest.Mock<(patch: Partial<MockCredential>) => Promise<MockCredential>>
}

const credentialStore: Record<string, MockCredential> = {}

jest.mock('../../src/models/Credential', () => ({
  Credential: {
    findByPk: jest.fn(async (id: string) => credentialStore[id] ?? null),
  },
}))

jest.mock('../../src/models/EvidenceUrl', () => {
  const rows: Record<string, Array<{ validationStatus: string; providerTier: 1 | 2 | null }>> = {}
  return {
    __rows: rows,
    EvidenceUrl: {
      findAll: jest.fn(async ({ where }: { where: { credentialId: string } }) =>
        rows[where.credentialId] ?? []
      ),
    },
  }
})

jest.mock('../../src/models/GithubScan', () => {
  const rows: Record<string, Array<any>> = {}
  return {
    __rows: rows,
    GithubScan: {
      findAll: jest.fn(async ({ where }: { where: { credentialId: string } }) =>
        rows[where.credentialId] ?? []
      ),
    },
  }
})

jest.mock('../../src/models/PeerReview', () => {
  const rows: Record<string, Array<{ weightFactor: number }>> = {}
  return {
    __rows: rows,
    PeerReview: {
      findAll: jest.fn(async ({ where }: { where: { credentialId: string } }) =>
        rows[where.credentialId] ?? []
      ),
    },
  }
})

jest.mock('../../src/models/ExpertReview', () => {
  const rows: Record<string, Array<{ confidenceRating: number | null }>> = {}
  return {
    __rows: rows,
    ExpertReview: {
      findAll: jest.fn(async ({ where }: { where: { credentialId: string } }) =>
        rows[where.credentialId] ?? []
      ),
    },
  }
})

jest.mock('../../src/models/TrustScoreHistory', () => ({
  TrustScoreHistory: {
    create: jest.fn(async (payload: unknown) => { historyCreate(payload); return payload }),
  },
}))

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCredential(id: string, overrides: Partial<MockCredential> = {}): MockCredential {
  const c: MockCredential = {
    id,
    trustScore: 0,
    verificationLayer: 1,
    update: jest.fn(async (patch: Partial<MockCredential>) => {
      Object.assign(c, patch)
      credentialUpdate(patch)
      return c
    }),
    ...overrides,
  }
  credentialStore[id] = c
  return c
}

async function setEvidence(credentialId: string, rows: Array<{ validationStatus: string; providerTier?: 1 | 2 | null }>) {
  const mod: any = await import('../../src/models/EvidenceUrl')
  mod.__rows[credentialId] = rows.map(r => ({ validationStatus: r.validationStatus, providerTier: r.providerTier ?? null }))
}

async function setScans(credentialId: string, rows: Array<{ scanStatus: string; healthScore?: number; skillMatchScore?: number; isFork?: boolean }>) {
  const mod: any = await import('../../src/models/GithubScan')
  mod.__rows[credentialId] = rows.map(r => ({
    scanStatus: r.scanStatus,
    healthScore: r.healthScore ?? 0,
    skillMatchScore: r.skillMatchScore ?? 0,
    isFork: r.isFork ?? false,
  }))
}

async function setPeers(credentialId: string, approvals: number) {
  const mod: any = await import('../../src/models/PeerReview')
  mod.__rows[credentialId] = Array.from({ length: approvals }, () => ({ weightFactor: 1.0 }))
}

async function setExperts(credentialId: string, rating: number | null) {
  const mod: any = await import('../../src/models/ExpertReview')
  mod.__rows[credentialId] = rating == null ? [] : [{ confidenceRating: rating }]
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('calculateTrustScore — persistence', () => {
  beforeEach(() => {
    for (const k of Object.keys(credentialStore)) delete credentialStore[k]
    credentialUpdate.mockClear()
    historyCreate.mockClear()
  })

  test('bare credential stays Layer 1, writes nothing (no delta)', async () => {
    const c = makeCredential('c1', { trustScore: 5, verificationLayer: 1 })
    await setEvidence(c.id, [])
    await setScans(c.id, [])
    await setPeers(c.id, 0)
    await setExperts(c.id, null)

    const { calculateTrustScore } = await import('../../src/services/trust-score.service')
    const r = await calculateTrustScore(c.id)
    expect(r.layer).toBe(1)
    expect(r.score).toBe(5)
    // Already at (5,1), no delta → no write.
    expect(c.update).not.toHaveBeenCalled()
    expect(historyCreate).not.toHaveBeenCalled()
  })

  test('one Tier-1 VALID URL promotes to Layer 2 and persists', async () => {
    const c = makeCredential('c2')
    await setEvidence(c.id, [{ validationStatus: 'VALID', providerTier: 1 }])
    await setScans(c.id, [])
    await setPeers(c.id, 0)
    await setExperts(c.id, null)

    const { calculateTrustScore } = await import('../../src/services/trust-score.service')
    const r = await calculateTrustScore(c.id)
    expect(r.layer).toBe(2)
    expect(r.score).toBeGreaterThanOrEqual(20)
    expect(r.score).toBeLessThanOrEqual(40)
    expect(c.update).toHaveBeenCalledWith(
      { trustScore: r.score, verificationLayer: 2 },
      expect.any(Object),
    )
    expect(historyCreate).toHaveBeenCalledTimes(1)
  })

  test('COMPLETE scan promotes to Layer 3', async () => {
    const c = makeCredential('c3')
    await setEvidence(c.id, [{ validationStatus: 'VALID', providerTier: 1 }])
    await setScans(c.id, [{ scanStatus: 'COMPLETE', healthScore: 20, skillMatchScore: 6, isFork: false }])
    await setPeers(c.id, 0)
    await setExperts(c.id, null)

    const { calculateTrustScore } = await import('../../src/services/trust-score.service')
    const r = await calculateTrustScore(c.id)
    expect(r.layer).toBe(3)
    expect(r.score).toBeGreaterThanOrEqual(40)
    expect(r.score).toBeLessThanOrEqual(60)
    expect(c.update).toHaveBeenCalled()
  })

  test('1 peer approval → Layer 4 (mintable gate)', async () => {
    const c = makeCredential('c4')
    await setEvidence(c.id, [{ validationStatus: 'VALID', providerTier: 1 }])
    await setScans(c.id, [{ scanStatus: 'COMPLETE', healthScore: 20, skillMatchScore: 6 }])
    await setPeers(c.id, 1)
    await setExperts(c.id, null)

    const { calculateTrustScore } = await import('../../src/services/trust-score.service')
    const r = await calculateTrustScore(c.id)
    expect(r.layer).toBe(4)
    expect(c.verificationLayer).toBe(4)
  })

  test('3 peer approvals → Layer 5', async () => {
    const c = makeCredential('c5')
    await setEvidence(c.id, [{ validationStatus: 'VALID', providerTier: 1 }])
    await setScans(c.id, [{ scanStatus: 'COMPLETE', healthScore: 20, skillMatchScore: 6 }])
    await setPeers(c.id, 3)
    await setExperts(c.id, null)

    const { calculateTrustScore } = await import('../../src/services/trust-score.service')
    const r = await calculateTrustScore(c.id)
    expect(r.layer).toBe(5)
    expect(c.verificationLayer).toBe(5)
  })

  test('expert with confidence 4 → Layer 6', async () => {
    const c = makeCredential('c6')
    await setEvidence(c.id, [{ validationStatus: 'VALID', providerTier: 1 }])
    await setScans(c.id, [{ scanStatus: 'COMPLETE', healthScore: 20, skillMatchScore: 6 }])
    await setPeers(c.id, 3)
    await setExperts(c.id, 4)

    const { calculateTrustScore } = await import('../../src/services/trust-score.service')
    const r = await calculateTrustScore(c.id)
    expect(r.layer).toBe(6)
    expect(c.verificationLayer).toBe(6)
    expect(c.trustScore).toBeGreaterThanOrEqual(90)
  })
})
