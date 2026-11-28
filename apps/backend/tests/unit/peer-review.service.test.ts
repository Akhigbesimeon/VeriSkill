// Unit tests for peer-review.service. Models, env and the MaxMind reader are
// mocked; no DB, no .env, no .mmdb file.
//
// Covers: hashIp, pure text heuristics (textFingerprint / maxSimilarity /
// shingleJaccard), buildWeightFactors across all branches, checkEligibility
// (self-review, account age, skill match + fallback, mutual cap),
// computeAgreementRate, and assignPeerReviewers end-to-end with the new
// eligibility gate wired in.

import crypto from 'crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { Op } from 'sequelize'

type AnyFn = (...args: any[]) => any

const mockUserFindAll    = jest.fn<AnyFn>()
const mockUserFindByPk   = jest.fn<AnyFn>()
const mockPeerCount      = jest.fn<AnyFn>()
const mockPeerFindAll    = jest.fn<AnyFn>()
const mockPeerCreate     = jest.fn<AnyFn>()
const mockCredentialCount = jest.fn<AnyFn>()
const mockExpertFindAll  = jest.fn<AnyFn>()
const mockReaderOpen     = jest.fn<AnyFn>()
const mockAsnLookup      = jest.fn<AnyFn>()

const mockEnv: Record<string, unknown> = {
  PEER_REVIEW_MIN_ACCOUNT_AGE_DAYS: 7,
  PEER_REVIEW_MAX_MUTUAL_REVIEWS: 2,
  PEER_REVIEW_FAST_SUBMIT_SECONDS: 60,
  PEER_REVIEW_DUP_SHINGLE_THRESHOLD: 0.75,
  PEER_REVIEW_DUP_HISTORY_LIMIT: 50,
  PEER_REVIEW_FLAG_WEIGHT_MULTIPLIER: 0.5,
}

jest.mock('../../src/config/env', () => ({ env: mockEnv }))
jest.mock('sequelize', () => ({ Op: { ne: Symbol.for('ne'), or: Symbol.for('or'), in: Symbol.for('in'), gte: Symbol.for('gte') } }))
jest.mock('@maxmind/geoip2-node', () => ({ Reader: { open: mockReaderOpen } }))
jest.mock('../../src/models/User', () => ({ User: { findAll: mockUserFindAll, findByPk: mockUserFindByPk } }))
jest.mock('../../src/models/PeerReview', () => ({
  PeerReview: { count: mockPeerCount, findAll: mockPeerFindAll, create: mockPeerCreate },
}))
jest.mock('../../src/models/Credential', () => ({ Credential: { count: mockCredentialCount } }))
jest.mock('../../src/models/ExpertReview', () => ({ ExpertReview: { findAll: mockExpertFindAll } }))

function loadService() {
  let svc: typeof import('../../src/services/peer-review.service')
  let errors: typeof import('../../src/middleware/error.middleware')
  jest.isolateModules(() => {
    svc = require('../../src/services/peer-review.service')
    errors = require('../../src/middleware/error.middleware')
  })
  return { ...svc!, ValidationError: errors!.ValidationError }
}

type Service = ReturnType<typeof loadService>
let service: Service

const DEVELOPER_ROLE = 'developer'

interface MockReviewer { id: string; role?: string; createdAt?: Date }

let reviewers: Record<string, MockReviewer>
let internalUsers: MockReviewer[]
let externalUsers: MockReviewer[]
let existingCount: number
let alreadyAssigned: Array<{ reviewerId: string }>
let credentialCounts: Record<string, Record<string, number>> // byReviewerId.byQueryTag → count
let mutualCountByReviewer: Record<string, number>

beforeAll(() => {
  loadService()
}, 60_000)

beforeEach(() => {
  jest.resetAllMocks()
  reviewers = {}
  internalUsers = []
  externalUsers = []
  existingCount = 0
  alreadyAssigned = []
  credentialCounts = {}
  mutualCountByReviewer = {}

  mockEnv.MAXMIND_ASN_DB_PATH = undefined

  mockUserFindAll.mockImplementation(async ({ where }: any) =>
    where.role === 'developer' ? internalUsers : externalUsers
  )
  mockUserFindByPk.mockImplementation(async (id: string) => reviewers[id] ?? null)

  // PeerReview.count has two call shapes: (a) credential-scoped assignment
  // guard (where:{credentialId}, no include) and (b) the mutual-review probe
  // (where:{reviewerId,status}, include:[{association:'credential',where:{developerId}}]).
  mockPeerCount.mockImplementation(async (opts: any) => {
    if (opts.include) return mutualCountByReviewer[opts.where.reviewerId] ?? 0
    return existingCount
  })
  mockPeerFindAll.mockImplementation(async () => alreadyAssigned)
  mockPeerCreate.mockImplementation(async (row: any) => ({ ...row }))

  // Credential.count has two shapes: same-skill (where.skill set) and
  // any-L3 fallback (no skill). Keyed by reviewerId → { same, any }.
  mockCredentialCount.mockImplementation(async ({ where }: any) => {
    const perReviewer = credentialCounts[where.developerId] ?? {}
    if (where.skill) return perReviewer.same ?? 0
    return perReviewer.any ?? 0
  })

  mockExpertFindAll.mockImplementation(async () => [])

  service = loadService()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

function makeReviewer(id: string, opts: { role?: string; ageDays?: number } = {}): MockReviewer {
  const now = Date.now()
  return {
    id,
    role: opts.role ?? DEVELOPER_ROLE,
    createdAt: new Date(now - (opts.ageDays ?? 30) * 86_400_000),
  }
}

// ─── hashIp ─────────────────────────────────────────────────────────────────

describe('hashIp', () => {
  test('returns the SHA-256 hex digest of the IP', () => {
    const ip = '203.0.113.7'
    const expected = crypto.createHash('sha256').update(ip).digest('hex')
    expect(service.hashIp(ip)).toBe(expected)
    expect(service.hashIp(ip)).toMatch(/^[0-9a-f]{64}$/)
  })

  test('never contains the raw IP', () => {
    expect(service.hashIp('198.51.100.1')).not.toContain('198.51.100.1')
  })
})

// ─── Text heuristics (pure) ─────────────────────────────────────────────────

describe('textFingerprint', () => {
  test('is stable across whitespace and casing', () => {
    expect(service.textFingerprint('Looks Good  To Me'))
      .toBe(service.textFingerprint('looks good to me'))
  })
  test('differs when the content differs', () => {
    expect(service.textFingerprint('abc')).not.toBe(service.textFingerprint('abd'))
  })
})

describe('shingleJaccard / maxSimilarity', () => {
  test('identical strings → 1.0', () => {
    expect(service.shingleJaccard('alpha beta gamma', 'alpha beta gamma')).toBe(1)
  })
  test('completely different → near 0', () => {
    expect(service.shingleJaccard('aaaaaaaaaa', 'zzzzzzzzzz')).toBeLessThan(0.1)
  })
  test('near-duplicate (small edit) → above threshold', () => {
    const a = 'this repository demonstrates a solid grasp of TypeScript and testing.'
    const b = 'this repository demonstrates a solid grasp of TypeScript and tests.'
    expect(service.shingleJaccard(a, b)).toBeGreaterThan(0.75)
  })
  test('maxSimilarity returns 0 for an empty history', () => {
    expect(service.maxSimilarity('anything', [])).toBe(0)
  })
  test('maxSimilarity returns the best match across the history', () => {
    const history = ['utterly unrelated prose', 'a solid grasp of TypeScript and testing.']
    expect(service.maxSimilarity('a solid grasp of typescript and testing.', history))
      .toBeGreaterThan(0.9)
  })
})

// ─── buildWeightFactors ─────────────────────────────────────────────────────

describe('buildWeightFactors', () => {
  const base = {
    sameIpHash: false, sameAsn: false, priorMutual: 0,
    skillMatched: true, agreementRate: null,
    fastSubmit: false, nearDuplicate: false,
    reviewerAsn: 64500 as number | null, reviewerIpHash: 'a'.repeat(64),
  }

  test('clean review → final weight 1.0', () => {
    const f = service.buildWeightFactors(base)
    expect(f.final).toBe(1.0)
    expect(f.flagged).toBe(false)
    expect(f.cluster).toBe('ASN#64500')
  })

  test('IP match → base 0 and final 0', () => {
    const f = service.buildWeightFactors({ ...base, sameIpHash: true })
    expect(f.base).toBe(0)
    expect(f.final).toBe(0)
  })

  test('same ASN → base 0.5', () => {
    const f = service.buildWeightFactors({ ...base, sameAsn: true })
    expect(f.base).toBe(0.5)
    expect(f.final).toBe(0.5)
  })

  test('priorMutual > 1 → base 0.5', () => {
    const f = service.buildWeightFactors({ ...base, priorMutual: 2 })
    expect(f.base).toBe(0.5)
  })

  test('fast submit → flagged and multiplied by 0.5', () => {
    const f = service.buildWeightFactors({ ...base, fastSubmit: true })
    expect(f.flagged).toBe(true)
    expect(f.final).toBe(0.5)
  })

  test('near-duplicate → flagged and halved', () => {
    const f = service.buildWeightFactors({ ...base, nearDuplicate: true })
    expect(f.flagged).toBe(true)
    expect(f.final).toBe(0.5)
  })

  test('agreement rate maps 0..1 into 0.5..1.0', () => {
    const lo = service.buildWeightFactors({ ...base, agreementRate: 0 })
    const mid = service.buildWeightFactors({ ...base, agreementRate: 0.5 })
    const hi = service.buildWeightFactors({ ...base, agreementRate: 1 })
    expect(lo.final).toBe(0.5)
    expect(mid.final).toBe(0.75)
    expect(hi.final).toBe(1.0)
  })

  test('cold start (null agreement) is neutral at 1.0', () => {
    const f = service.buildWeightFactors({ ...base, agreementRate: null })
    expect(f.final).toBe(1.0)
  })

  test('cluster falls back to IP hash when ASN is unknown', () => {
    const f = service.buildWeightFactors({ ...base, reviewerAsn: null })
    expect(f.cluster.startsWith('IP#')).toBe(true)
  })

  test('final weight is bounded to [0,1]', () => {
    const f = service.buildWeightFactors({
      ...base, sameIpHash: true, fastSubmit: true, nearDuplicate: true, agreementRate: 0,
    })
    expect(f.final).toBe(0)
  })
})

// ─── checkEligibility ───────────────────────────────────────────────────────

describe('checkEligibility', () => {
  test('rejects self-review', async () => {
    const check = await service.checkEligibility('me', 'me', 'JavaScript')
    expect(check.eligible).toBe(false)
    expect(check.reason).toBe('self_review')
  })

  test('rejects accounts younger than the minimum age', async () => {
    reviewers['rev'] = makeReviewer('rev', { ageDays: 1 })
    const check = await service.checkEligibility('rev', 'dev', 'JavaScript')
    expect(check.eligible).toBe(false)
    expect(check.reason).toBe('account_too_new')
  })

  test('rejects developers with no L3+ credential', async () => {
    reviewers['rev'] = makeReviewer('rev')
    credentialCounts['rev'] = { same: 0, any: 0 }
    const check = await service.checkEligibility('rev', 'dev', 'JavaScript')
    expect(check.eligible).toBe(false)
    expect(check.reason).toBe('no_qualifying_credential')
  })

  test('accepts a developer with a same-skill L3+ credential and marks skill matched', async () => {
    reviewers['rev'] = makeReviewer('rev')
    credentialCounts['rev'] = { same: 1, any: 1 }
    const check = await service.checkEligibility('rev', 'dev', 'JavaScript')
    expect(check.eligible).toBe(true)
    expect(check.skillMatched).toBe(true)
  })

  test('accepts a developer with any L3+ credential (fallback) with skill matched = false', async () => {
    reviewers['rev'] = makeReviewer('rev')
    credentialCounts['rev'] = { same: 0, any: 1 }
    const check = await service.checkEligibility('rev', 'dev', 'JavaScript')
    expect(check.eligible).toBe(true)
    expect(check.skillMatched).toBe(false)
  })

  test('peer_verifier accounts skip the credential gate', async () => {
    reviewers['rev'] = makeReviewer('rev', { role: 'peer_verifier' })
    const check = await service.checkEligibility('rev', 'dev', 'JavaScript')
    expect(check.eligible).toBe(true)
    expect(mockCredentialCount).not.toHaveBeenCalled()
  })

  test('rejects when reviewer hit the mutual-review cap', async () => {
    reviewers['rev'] = makeReviewer('rev')
    credentialCounts['rev'] = { same: 1, any: 1 }
    mutualCountByReviewer['rev'] = 2
    const check = await service.checkEligibility('rev', 'dev', 'JavaScript')
    expect(check.eligible).toBe(false)
    expect(check.reason).toBe('too_many_mutual')
  })
})

// ─── assignPeerReviewers ────────────────────────────────────────────────────

describe('assignPeerReviewers', () => {
  test('rejects credentials below Layer 3 with a 422', async () => {
    const err = await service.assignPeerReviewers('cred', 'dev', 2, 'JavaScript').catch(e => e)
    expect(err).toBeInstanceOf(service.ValidationError)
    expect(err.statusCode).toBe(422)
    expect(mockUserFindAll).not.toHaveBeenCalled()
  })

  test('no-ops when the credential already has ≥2 reviews', async () => {
    existingCount = 2
    internalUsers = [makeReviewer('rev-1')]
    const result = await service.assignPeerReviewers('cred', 'dev', 3, 'JavaScript')
    expect(result).toEqual([])
    expect(mockPeerCreate).not.toHaveBeenCalled()
  })

  test('skips candidates that fail eligibility (too new)', async () => {
    internalUsers = [makeReviewer('too-new', { ageDays: 1 }), makeReviewer('ok')]
    reviewers['too-new'] = internalUsers[0]
    reviewers['ok'] = internalUsers[1]
    credentialCounts['too-new'] = { same: 1, any: 1 }
    credentialCounts['ok']      = { same: 1, any: 1 }

    const result = await service.assignPeerReviewers('cred', 'dev', 3, 'JavaScript')
    expect(result.map(r => r.reviewerId)).toEqual(['ok'])
  })

  test('skips candidates already at the mutual-review cap', async () => {
    internalUsers = [makeReviewer('capped'), makeReviewer('ok')]
    reviewers['capped'] = internalUsers[0]
    reviewers['ok'] = internalUsers[1]
    credentialCounts['capped'] = { same: 1, any: 1 }
    credentialCounts['ok']     = { same: 1, any: 1 }
    mutualCountByReviewer['capped'] = 2

    const result = await service.assignPeerReviewers('cred', 'dev', 3, 'JavaScript')
    expect(result.map(r => r.reviewerId)).toEqual(['ok'])
  })

  test('caps the assignment at 3 eligible reviewers', async () => {
    internalUsers = ['a', 'b', 'c', 'd'].map(id => makeReviewer(id))
    for (const u of internalUsers) {
      reviewers[u.id] = u
      credentialCounts[u.id] = { same: 1, any: 1 }
    }
    const result = await service.assignPeerReviewers('cred', 'dev', 3, 'JavaScript')
    expect(result.map(r => r.reviewerId)).toEqual(['a', 'b', 'c'])
  })

  test('created rows have the new audit record on weightFactors', async () => {
    internalUsers = [makeReviewer('rev')]
    reviewers['rev'] = internalUsers[0]
    credentialCounts['rev'] = { same: 1, any: 1 }

    const [row] = await service.assignPeerReviewers('cred', 'dev', 3, 'JavaScript')
    expect(row.weightFactors).toMatchObject({ skillMatch: true, flagged: false })
    expect(row.weightFactor).toBe(1.0)
    expect(row.flagged).toBe(false)
  })
})
