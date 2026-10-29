import { describe, it, expect, jest } from '@jest/globals'

// checkVerifiableCredential is a pure parser, but url-verification.service
// pulls in env (process.exit on missing vars), sequelize-backed models and
// trust-score.service at module load. Stub them so the module can import.
jest.mock('../../src/config/env', () => ({ env: {} }))
jest.mock('../../src/config/sequelize', () => ({ __esModule: true, default: {} }))
jest.mock('../../src/models/EvidenceUrl', () => ({ EvidenceUrl: {} }))
jest.mock('../../src/models/Provider', () => ({ Provider: {} }))
jest.mock('../../src/services/trust-score.service', () => ({
  calculateTrustScore: jest.fn(),
}))

import { checkVerifiableCredential } from '../../src/services/url-verification.service'

describe('checkVerifiableCredential', () => {
  it('returns cryptoVerified=true for a well-formed W3C VC JSON', () => {
    const vc = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential'],
      issuer: 'https://coursera.org/issuers/abc',
      credentialSubject: { id: 'did:example:learner', name: 'Alice' },
      proof: { type: 'Ed25519Signature2020', created: '2026-01-01T00:00:00Z' },
    }
    const result = checkVerifiableCredential(JSON.stringify(vc), 'application/vc+ld+json')
    expect(result.isCredential).toBe(true)
    expect(result.cryptoVerified).toBe(true)
    expect(result.issuer).toBe('https://coursera.org/issuers/abc')
  })

  it('returns isCredential=false for plain HTML', () => {
    const result = checkVerifiableCredential('<html><body>cert page</body></html>', 'text/html')
    expect(result.isCredential).toBe(false)
    expect(result.cryptoVerified).toBe(false)
  })

  it('returns cryptoVerified=false when context matches but proof is missing', () => {
    const malformed = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      credentialSubject: { id: 'did:example:x' },
    }
    const result = checkVerifiableCredential(JSON.stringify(malformed), 'application/json')
    expect(result.isCredential).toBe(true)
    expect(result.cryptoVerified).toBe(false)
  })
})
