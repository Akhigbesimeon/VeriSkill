// Unit tests for the cluster-diversity gate and the expert-ceiling rule in
// trust-score.service. Models and the sequelize transaction wrapper are
// mocked; no DB required.

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

type AnyFn = (...args: any[]) => any

const mockEvidenceFindAll  = jest.fn<AnyFn>()
const mockGithubFindAll    = jest.fn<AnyFn>()
const mockPeerFindAll      = jest.fn<AnyFn>()
const mockExpertFindAll    = jest.fn<AnyFn>()
const mockCredentialFindByPk = jest.fn<AnyFn>()
const mockHistoryCreate    = jest.fn<AnyFn>()
const mockTransaction      = jest.fn<AnyFn>()

jest.mock('sequelize', () => ({ Op: { in: Symbol.for('in'), ne: Symbol.for('ne') } }))
jest.mock('../../src/config/sequelize', () => ({ __esModule: true, default: { transaction: mockTransaction } }))
jest.mock('../../src/models/EvidenceUrl', () => ({ EvidenceUrl: { findAll: mockEvidenceFindAll } }))
jest.mock('../../src/models/GithubScan', () => ({ GithubScan: { findAll: mockGithubFindAll } }))
jest.mock('../../src/models/PeerReview', () => ({ PeerReview: { findAll: mockPeerFindAll } }))
jest.mock('../../src/models/ExpertReview', () => ({ ExpertReview: { findAll: mockExpertFindAll } }))
jest.mock('../../src/models/Credential', () => ({ Credential: { findByPk: mockCredentialFindByPk } }))
jest.mock('../../src/models/TrustScoreHistory', () => ({ TrustScoreHistory: { create: mockHistoryCreate } }))

function loadService() {
  let svc: typeof import('../../src/services/trust-score.service')
  jest.isolateModules(() => { svc = require('../../src/services/trust-score.service') })
  return svc!
}

let service: ReturnType<typeof loadService>
let credentialRow: { trustScore: number; verificationLayer: number; update: jest.Mock }

beforeEach(() => {
  jest.resetAllMocks()
  credentialRow = {
    trustScore: 0,
    verificationLayer: 1,
    update: jest.fn(async () => undefined) as any,
  }

  mockEvidenceFindAll.mockResolvedValue([])
  mockGithubFindAll.mockResolvedValue([{
    healthScore: 20, skillMatchScore: 6, isFork: false,
  }])
  mockPeerFindAll.mockResolvedValue([])
  mockExpertFindAll.mockResolvedValue([])
  mockCredentialFindByPk.mockResolvedValue(credentialRow)
  mockHistoryCreate.mockResolvedValue(undefined)
  mockTransaction.mockImplementation(async (cb: AnyFn) => cb({}))

  service = loadService()
})

function approval(opts: { weight?: number; asn?: number | null; ip?: string | null } = {}) {
  return {
    weightFactor: opts.weight ?? 1,
    reviewerAsn: opts.asn ?? null,
    reviewerIpHash: opts.ip ?? null,
  }
}

describe('cluster-diversity gate', () => {
  test('single-cluster approvals do not promote to Layer 4', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ asn: 1000 }),
      approval({ asn: 1000 }),
    ])
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(3)
  })

  test('two distinct ASNs promote to Layer 4', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ asn: 1000 }),
      approval({ asn: 2000 }),
    ])
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(4)
  })

  test('two distinct IP hashes (no ASN) also pass the cluster gate', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ asn: null, ip: 'aaaaaaaaaaaaaaaaa' }),
      approval({ asn: null, ip: 'bbbbbbbbbbbbbbbbb' }),
    ])
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(4)
  })

  test('3 weighted approvals from 1 cluster stays below Layer 5', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ asn: 1000 }), approval({ asn: 1000 }), approval({ asn: 1000 }),
    ])
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(3)
  })

  test('3 weighted approvals from 3 clusters reach Layer 5', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ asn: 1000 }), approval({ asn: 2000 }), approval({ asn: 3000 }),
    ])
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(5)
  })
})

describe('expert-ceiling rule', () => {
  test('peer approvals alone never reach Layer 6', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ asn: 1000 }), approval({ asn: 2000 }), approval({ asn: 3000 }),
      approval({ asn: 4000 }),
    ])
    mockExpertFindAll.mockResolvedValue([])
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(5)
  })

  test('expert with confidence 3+ unlocks Layer 6', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ asn: 1000 }), approval({ asn: 2000 }), approval({ asn: 3000 }),
    ])
    mockExpertFindAll.mockResolvedValue([{ confidenceRating: 4 }])
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(6)
  })

  test('expert with confidence 2 does not reach Layer 6', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ asn: 1000 }), approval({ asn: 2000 }), approval({ asn: 3000 }),
    ])
    mockExpertFindAll.mockResolvedValue([{ confidenceRating: 2 }])
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(5)
  })
})

describe('flagged-review weight is already applied upstream', () => {
  test('a downweighted (0.5) approval counts only as half', async () => {
    mockPeerFindAll.mockResolvedValue([
      approval({ weight: 0.5, asn: 1000 }),
      approval({ weight: 0.5, asn: 2000 }),
    ])
    // sum = 1.0 → Layer 4, not Layer 5
    const { layer } = await service.calculateTrustScore('cred')
    expect(layer).toBe(4)
  })
})
