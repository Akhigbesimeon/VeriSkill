// Unit tests for the submit-flow rules: artifact URL validation, exact +
// near-duplicate detection, and the flag-and-queue decision. The route
// handler itself is thin orchestration; these tests exercise the pure
// helpers it composes, which is where the integrity logic lives.

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

const mockEnv: Record<string, unknown> = {
  PEER_REVIEW_MIN_ACCOUNT_AGE_DAYS: 7,
  PEER_REVIEW_MAX_MUTUAL_REVIEWS: 2,
  PEER_REVIEW_FAST_SUBMIT_SECONDS: 60,
  PEER_REVIEW_DUP_SHINGLE_THRESHOLD: 0.75,
  PEER_REVIEW_DUP_HISTORY_LIMIT: 50,
  PEER_REVIEW_FLAG_WEIGHT_MULTIPLIER: 0.5,
}

jest.mock('../../src/config/env', () => ({ env: mockEnv }))
jest.mock('../../src/config/sequelize', () => ({
  __esModule: true,
  default: { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
}))
jest.mock('sequelize', () => ({
  Op: { ne: Symbol.for('ne'), or: Symbol.for('or'), in: Symbol.for('in'), gte: Symbol.for('gte') },
  // The real DataTypes is used by model init via the sequelize config path,
  // which we replace above; the models imported transitively need these keys
  // to not throw at import-time.
  DataTypes: new Proxy({}, { get: () => ({}) }),
  Model: class {},
}))
jest.mock('@maxmind/geoip2-node', () => ({ Reader: { open: jest.fn() } }))
jest.mock('../../src/models/User', () => ({ User: { findAll: jest.fn(), findByPk: jest.fn() } }))
jest.mock('../../src/models/PeerReview', () => ({ PeerReview: { count: jest.fn(), findAll: jest.fn(), create: jest.fn() } }))
jest.mock('../../src/models/Credential', () => ({ Credential: { count: jest.fn(), findByPk: jest.fn() } }))
jest.mock('../../src/models/ExpertReview', () => ({ ExpertReview: { findAll: jest.fn() } }))
jest.mock('../../src/models/EvidenceUrl', () => ({ EvidenceUrl: { findAll: jest.fn(async () => []) } }))
jest.mock('../../src/models/GithubScan', () => ({ GithubScan: { findAll: jest.fn(async () => []) } }))
jest.mock('../../src/models/TrustScoreHistory', () => ({ TrustScoreHistory: { create: jest.fn() } }))

// Load the route module to pull out the exported test helpers.
jest.mock('../../src/routes/peer-review.routes', () => {
  // Re-require after the above mocks are registered.
  return jest.requireActual('../../src/routes/peer-review.routes')
})

let routes: typeof import('../../src/routes/peer-review.routes')
let service: typeof import('../../src/services/peer-review.service')
let errors: typeof import('../../src/middleware/error.middleware')
let shared: typeof import('@veriskill/shared')

beforeEach(() => {
  jest.isolateModules(() => {
    routes = require('../../src/routes/peer-review.routes')
    service = require('../../src/services/peer-review.service')
    errors = require('../../src/middleware/error.middleware')
    shared = require('@veriskill/shared')
  })
})

// ─── Rubric + artifact schema ──────────────────────────────────────────────

describe('peerReviewSubmitSchema', () => {
  const good = {
    decision: 'APPROVE' as const,
    rationale: 'A'.repeat(60),
    artifactUrl: 'https://github.com/foo/bar/blob/main/src/index.ts',
    rubric: {
      skillDemonstrated: true,
      codeAuthorship: true,
      evidenceQuality: 'strong' as const,
      concerns: 'none' as const,
    },
  }

  test('accepts a well-formed submission', () => {
    expect(() => shared.peerReviewSubmitSchema.parse(good)).not.toThrow()
  })

  test('rejects a rationale shorter than 60 chars', () => {
    expect(() => shared.peerReviewSubmitSchema.parse({ ...good, rationale: 'short' })).toThrow()
  })

  test('rejects a missing rubric field', () => {
    const bad = { ...good, rubric: { ...good.rubric } }
    delete (bad.rubric as any).concerns
    expect(() => shared.peerReviewSubmitSchema.parse(bad)).toThrow()
  })

  test('rejects an invalid evidence quality value', () => {
    expect(() => shared.peerReviewSubmitSchema.parse({
      ...good,
      rubric: { ...good.rubric, evidenceQuality: 'excellent' as any },
    })).toThrow()
  })

  test('requires HTTPS on the artifact URL', () => {
    expect(() => shared.peerReviewSubmitSchema.parse({ ...good, artifactUrl: 'http://github.com/a/b' })).toThrow()
  })
})

// ─── Artifact URL (route helper) ───────────────────────────────────────────

describe('validateArtifactUrl', () => {
  test('accepts a specific GitHub file', () => {
    expect(() => routes.__test.validateArtifactUrl('https://github.com/foo/bar/blob/main/src/index.ts'))
      .not.toThrow()
  })
  test('accepts a specific commit', () => {
    expect(() => routes.__test.validateArtifactUrl('https://github.com/foo/bar/commit/abcdef'))
      .not.toThrow()
  })
  test('accepts a gist', () => {
    expect(() => routes.__test.validateArtifactUrl('https://gist.github.com/alice/abc123'))
      .not.toThrow()
  })
  test('rejects a non-GitHub host', () => {
    expect(() => routes.__test.validateArtifactUrl('https://example.com/some/path'))
      .toThrow(/github/i)
  })
  test('rejects a bare GitHub user profile (no repo segment)', () => {
    expect(() => routes.__test.validateArtifactUrl('https://github.com/alice'))
      .toThrow(/specific/i)
  })
  test('rejects nonsense input', () => {
    expect(() => routes.__test.validateArtifactUrl('not a url at all'))
      .toThrow()
  })
})

// ─── Blinding ──────────────────────────────────────────────────────────────

describe('blindCredential', () => {
  test('strips developerId and developer object', () => {
    const fake = {
      toJSON: () => ({ id: 'c', skill: 'JavaScript', developerId: 'd', developer: { id: 'd', displayName: 'Jane' } }),
    } as any
    const out = routes.__test.blindCredential(fake)
    expect(out).not.toHaveProperty('developerId')
    expect(out).not.toHaveProperty('developer')
    expect(out.skill).toBe('JavaScript')
  })
})

// ─── Duplicate detection semantics ─────────────────────────────────────────

describe('duplicate detection', () => {
  const canonical = 'The repository demonstrates competent TypeScript and clean module structure.'

  test('exact duplicate has fingerprint collision', () => {
    expect(service.textFingerprint(canonical)).toBe(service.textFingerprint(canonical.toUpperCase()))
  })

  test('a tiny edit still trips the near-dup threshold', () => {
    const edited = 'The repository demonstrates competent TypeScript and clean module layout.'
    expect(service.maxSimilarity(edited, [canonical])).toBeGreaterThan(mockEnv.PEER_REVIEW_DUP_SHINGLE_THRESHOLD as number)
  })

  test('unrelated prose stays below the threshold', () => {
    const unrelated = 'The candidate correctly identified the off-by-one error in the parser.'
    expect(service.maxSimilarity(unrelated, [canonical])).toBeLessThan(mockEnv.PEER_REVIEW_DUP_SHINGLE_THRESHOLD as number)
  })
})

// ─── Flag-and-queue decision ───────────────────────────────────────────────

describe('flag-and-queue decision (via buildWeightFactors)', () => {
  const base = {
    sameIpHash: false, sameAsn: false, priorMutual: 0,
    skillMatched: true, agreementRate: null,
    fastSubmit: false, nearDuplicate: false,
    reviewerAsn: 64500 as number | null, reviewerIpHash: 'a'.repeat(64),
  }

  test('a fast-submit review is flagged and downweighted', () => {
    const f = service.buildWeightFactors({ ...base, fastSubmit: true })
    expect(f.flagged).toBe(true)
    expect(f.final).toBe(0.5)
  })

  test('a near-duplicate review is flagged and downweighted', () => {
    const f = service.buildWeightFactors({ ...base, nearDuplicate: true })
    expect(f.flagged).toBe(true)
    expect(f.final).toBe(0.5)
  })

  test('the audit record records which signal fired', () => {
    const f = service.buildWeightFactors({ ...base, fastSubmit: true })
    expect(f.fastSubmit).toBe(true)
    expect(f.nearDuplicate).toBe(false)
  })
})

// Peer-review.routes module exposes __test.validateArtifactUrl via a named
// export so these tests don't need to spin up Express. If __test disappears,
// restore the direct helper.
describe('route module surface', () => {
  test('__test helpers are exported', () => {
    expect(typeof routes.__test.validateArtifactUrl).toBe('function')
    expect(typeof routes.__test.blindCredential).toBe('function')
    expect(typeof routes.__test.blindReview).toBe('function')
  })
  test('ValidationError is thrown with a 422 status', () => {
    try { routes.__test.validateArtifactUrl('https://example.com/a/b') }
    catch (e: any) {
      expect(e).toBeInstanceOf(errors.ValidationError)
      expect(e.statusCode).toBe(422)
    }
  })
})
