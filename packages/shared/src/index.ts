/**
 * Shared package barrel export.
 * Import from '@veriskill/shared' in any workspace.
 */

// Constants
export * from './constants/skills'
export * from './constants/layers'
export * from './constants/providers'

// Schemas (Zod — types are inferred, no separate types/ folder yet)
export * from './schemas'

// Recruiter / ATS API — shared Zod schemas + typed client used by the
// backend contract tests and by ATS integrations.
export * from './recruiter-api'

// ABI (populated after Phase 1 contract deployment)
// export * from './abi'
