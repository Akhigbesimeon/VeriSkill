import { z } from 'zod'

/**
 * Zod schemas for the public recruiter API.
 *
 * These are the SINGLE SOURCE OF TRUTH for the shape of every response the
 * recruiter / ATS endpoints emit. The backend tests parse every response
 * through them, so any accidental field rename or type change fails the test
 * suite immediately. The typed client in ./client.ts uses the same schemas
 * at runtime, so an ATS integration gets the same guarantee the backend does.
 *
 * Mirrors docs/openapi.yaml. If one changes, change both.
 */

export const publicVerdictStatusSchema = z.enum(['VALID', 'SUSPENDED', 'REVOKED', 'NOT_FOUND'])

export const onChainProofSchema = z.object({
  chain:             z.string(),
  chainId:           z.number().int().positive(),
  contractAddress:   z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenId:           z.string().nullable(),
  easAttestationUid: z.string().nullable(),
  txHash:            z.string().nullable(),
})

export const publicVerdictSchema = z.object({
  id:         z.string().uuid(),
  status:     publicVerdictStatusSchema,
  skill:      z.string().nullable(),
  layer:      z.number().int().min(1).max(6).nullable(),
  trustScore: z.number().min(0).max(100).nullable(),
  issuedAt:   z.string().datetime().nullable(),
  verifiedAt: z.string().datetime(),
  onChain:    onChainProofSchema.nullable(),
})

export const batchResponseSchema = z.object({
  results: z.array(publicVerdictSchema),
})

export type PublicVerdictStatus = z.infer<typeof publicVerdictStatusSchema>
export type OnChainProof        = z.infer<typeof onChainProofSchema>
export type PublicVerdict       = z.infer<typeof publicVerdictSchema>
export type BatchResponse       = z.infer<typeof batchResponseSchema>
