import { z } from 'zod'
import { APPROVED_SKILLS } from '../constants/skills'

export const createCredentialSchema = z.object({
  skill: z.enum(APPROVED_SKILLS),
})

export const evidenceUrlSchema = z.object({
  url: z.string().url().startsWith('https://', 'URL must be HTTPS'),
  evidenceDate: z.string().date().optional(),
})

export const githubRepoSchema = z.object({
  repoUrl: z.string().url().includes('github.com', { message: 'Must be a GitHub URL' }),
})

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>
export type EvidenceUrlInput = z.infer<typeof evidenceUrlSchema>
export type GithubRepoInput = z.infer<typeof githubRepoSchema>
