// End-to-end credential mint flow — exercises the Express route, the
// credential service create path, and the real blockchain.service.mintCredential
// against mocked models and a fake ethers Contract. No real DB or RPC.

import express from 'express'
import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import request from 'supertest'

// ─── Env (must mock before any import that reads it) ──────────────────────────
jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    RPC_URL: 'http://localhost:8545',
    CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001',
    ISSUER_PRIVATE_KEY:
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    ISSUER_ADDRESS: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    GITHUB_TOKEN: 'test-token',
    OPENSSF_SCORECARD_ENABLED: false,
  },
}))

// Sequelize is never touched — models are fully mocked.
jest.mock('../../src/config/sequelize', () => ({ __esModule: true, default: {} }))

// ─── In-memory stores ─────────────────────────────────────────────────────────
const credStore: Record<string, any> = {}
const auditLog: any[] = []
let userWallet: string | null = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'

// ─── Model mocks ──────────────────────────────────────────────────────────────
jest.mock('../../src/models/Credential', () => ({
  Credential: {
    create: jest.fn(async (data: any) => {
      const id = `cred-${Object.keys(credStore).length + 1}`
      const row: any = {
        id,
        verificationLayer: data.verificationLayer ?? 1,
        trustScore: data.trustScore ?? 0,
        tokenId: null,
        commitHash: null,
        onChainMintedAt: null,
        ...data,
      }
      row.update = async function (patch: any) { Object.assign(row, patch); return row }
      credStore[id] = row
      return row
    }),
    findByPk: jest.fn(async (id: string, opts?: any) => {
      const row = credStore[id]
      if (!row) return null
      if (opts?.include) {
        const shadow: any = { ...row }
        shadow.developer = { id: row.developerId, walletAddress: userWallet }
        // Writes propagate back to the shared row so re-fetches see MINTED.
        shadow.update = async (patch: any) => {
          Object.assign(row, patch); Object.assign(shadow, patch); return shadow
        }
        return shadow
      }
      return row
    }),
    findAll: jest.fn(async () => Object.values(credStore)),
    findOne: jest.fn(async (opts: any) => {
      const { id, developerId } = opts.where
      const row = credStore[id]
      if (!row) return null
      if (developerId && row.developerId !== developerId) return null
      return row
    }),
  },
}))

jest.mock('../../src/models/AuditLog', () => ({
  AuditLog: { create: jest.fn(async (p: any) => { auditLog.push(p); return p }) },
}))

jest.mock('../../src/models/TrustScoreHistory', () => ({
  TrustScoreHistory: { findAll: jest.fn(async () => []) },
}))

// Models referenced only via imports in credential.service — unused at runtime for mint flow.
jest.mock('../../src/models/EvidenceUrl', () => ({ EvidenceUrl: {} }))
jest.mock('../../src/models/GithubScan',  () => ({ GithubScan:  {} }))
jest.mock('../../src/models/PeerReview',  () => ({ PeerReview:  {} }))
jest.mock('../../src/models/User',        () => ({ User:        {} }))
jest.mock('../../src/models/ExpertReview',() => ({ ExpertReview:{} }))

// Supporting services imported by credential.service — unused by mint endpoint.
jest.mock('../../src/services/trust-score.service', () => ({ calculateTrustScore: jest.fn() }))
jest.mock('../../src/services/peer-review.service', () => ({ assignPeerReviewers: jest.fn() }))
jest.mock('../../src/services/github-scan.service', () => ({
  scanRepository: jest.fn(),
  preflightSkillMatch: jest.fn(async () => ({ matches: true })),
}))

// Queues — producer-side only, not exercised by mint flow.
jest.mock('../../src/jobs/queues', () => ({
  urlVerificationQueue: { add: jest.fn() },
  githubScanQueue:      { add: jest.fn() },
}))

// Auth: inject the user from a test header.
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = JSON.parse(req.headers['x-test-user'] as string)
    next()
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}))

// ─── Chain: fake only the Contract constructor; keep Wallet real. ─────────────
const contractMint = jest.fn()
const contractRevoke = jest.fn()
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers') as any
  class FakeContract {
    interface = {
      parseLog: (log: any) => {
        if (log._kind === 'minted')   return { name: 'CredentialMinted',   args: { tokenId: BigInt(42) } }
        if (log._kind === 'attested') return { name: 'CredentialAttested', args: { easUid: '0xdeadbeef' } }
        return null
      },
    }
    mintCredential   = contractMint
    revokeCredential = contractRevoke
  }
  class FakeProvider {}
  // Patch BOTH the top-level named exports AND the `ethers` namespace export —
  // blockchain.service uses `import { ethers } from 'ethers'` and reaches into
  // the namespace, so overriding named exports alone leaves the real
  // JsonRpcProvider in place.
  const patched = { ...actual, Contract: FakeContract, JsonRpcProvider: FakeProvider }
  patched.ethers = { ...actual.ethers, Contract: FakeContract, JsonRpcProvider: FakeProvider }
  return patched
})

// ─── App factory ──────────────────────────────────────────────────────────────
function makeApp() {
  const { credentialRouter } = require('../../src/routes/credential.routes')
  const { errorHandler }     = require('../../src/middleware/error.middleware')
  const app = express()
  app.use(express.json())
  app.use('/api/v1/credentials', credentialRouter)
  app.use(errorHandler)
  return app
}

const dev      = { id: 'dev-1', email: 'dev@test',   role: 'developer' }
const otherDev = { id: 'dev-2', email: 'other@test', role: 'developer' }
const asUser   = (u: typeof dev) => ({ 'x-test-user': JSON.stringify(u) })

// ─── Tests ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  for (const k of Object.keys(credStore)) delete credStore[k]
  auditLog.length = 0
  contractMint.mockReset()
  contractRevoke.mockReset()
  userWallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
  contractMint.mockImplementation(async () => ({
    hash: '0xTX',
    wait: async () => ({ hash: '0xTX', logs: [{ _kind: 'minted' }, { _kind: 'attested' }] }),
  }))
})

describe('integration: credential mint flow', () => {
  test('end-to-end mint succeeds, flips status, writes audit log', async () => {
    const app = makeApp()

    const create = await request(app)
      .post('/api/v1/credentials').set(asUser(dev)).send({ skill: 'TypeScript' })
    expect(create.status).toBe(201)
    const credId = create.body.id
    expect(credStore[credId].lifecycleStatus).toBe('DRAFT')

    // Shortcut: real path reaches Layer 4 via evidence + reviews. The mint flow
    // itself is what this test covers, so promote the credential directly.
    credStore[credId].verificationLayer = 4
    credStore[credId].lifecycleStatus   = 'ACTIVE'

    const res = await request(app)
      .post(`/api/v1/credentials/${credId}/mint`).set(asUser(dev))

    expect(res.status).toBe(200)
    expect(res.body.tokenId).toBe('42')
    expect(credStore[credId].lifecycleStatus).toBe('MINTED')
    expect(credStore[credId].tokenId).toBe('42')
    expect(credStore[credId].onChainMintedAt).toBeInstanceOf(Date)
    expect(auditLog).toHaveLength(1)
    expect(auditLog[0]).toMatchObject({
      action:       'credential.minted',
      resourceId:   credId,
      resourceType: 'credential',
      payload: expect.objectContaining({
        tokenId: '42', easUid: '0xdeadbeef', layer: 4, txHash: '0xTX',
      }),
    })
    expect(contractMint).toHaveBeenCalledTimes(1)
    const [walletArg, , , layerArg] = contractMint.mock.calls[0] as any[]
    expect(walletArg).toBe(userWallet)
    expect(layerArg).toBe(4)
  })

  test('mint rejected when verificationLayer < 4', async () => {
    const app = makeApp()
    const create = await request(app)
      .post('/api/v1/credentials').set(asUser(dev)).send({ skill: 'Go' })
    const credId = create.body.id
    credStore[credId].verificationLayer = 3

    const res = await request(app).post(`/api/v1/credentials/${credId}/mint`).set(asUser(dev))

    expect(res.status).toBe(422)
    expect(contractMint).not.toHaveBeenCalled()
    expect(auditLog).toHaveLength(0)
  })

  test("another developer's credential returns 404", async () => {
    const app = makeApp()
    const create = await request(app)
      .post('/api/v1/credentials').set(asUser(dev)).send({ skill: 'Rust' })
    const credId = create.body.id
    credStore[credId].verificationLayer = 4

    const res = await request(app).post(`/api/v1/credentials/${credId}/mint`).set(asUser(otherDev))

    expect(res.status).toBe(404)
    expect(contractMint).not.toHaveBeenCalled()
  })

  test('re-minting an already-MINTED credential is rejected', async () => {
    const app = makeApp()
    const create = await request(app)
      .post('/api/v1/credentials').set(asUser(dev)).send({ skill: 'Solidity' })
    const credId = create.body.id
    credStore[credId].verificationLayer = 4

    const first  = await request(app).post(`/api/v1/credentials/${credId}/mint`).set(asUser(dev))
    const second = await request(app).post(`/api/v1/credentials/${credId}/mint`).set(asUser(dev))

    expect(first.status).toBe(200)
    expect(second.status).toBe(422)
    expect(contractMint).toHaveBeenCalledTimes(1)
    expect(auditLog).toHaveLength(1)
  })

  test('developer with no wallet address cannot mint', async () => {
    const app = makeApp()
    const create = await request(app)
      .post('/api/v1/credentials').set(asUser(dev)).send({ skill: 'React' })
    const credId = create.body.id
    credStore[credId].verificationLayer = 4
    userWallet = null

    const res = await request(app).post(`/api/v1/credentials/${credId}/mint`).set(asUser(dev))

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/wallet/i)
    expect(contractMint).not.toHaveBeenCalled()
  })

  test('unknown skill is rejected at validation', async () => {
    const app = makeApp()
    const res = await request(app)
      .post('/api/v1/credentials').set(asUser(dev)).send({ skill: 'COBOL' })
    expect(res.status).toBe(422)
  })
})
