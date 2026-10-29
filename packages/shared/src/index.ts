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

// ABI (populated after Phase 1 contract deployment)
// export * from './abi'
