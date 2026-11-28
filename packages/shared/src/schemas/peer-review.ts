import { z } from 'zod'

/**
 * Fixed rubric a reviewer must answer when submitting a peer review.
 * The questions are intentionally short and verifiable from the evidence,
 * not open-ended essay prompts. Free text is kept in the separate
 * `rationale` field so the rubric remains machine-checkable.
 *
 * Fields:
 *   skillDemonstrated   — did the artifact(s) show the claimed skill?
 *   codeAuthorship      — did the reviewer check the artifact belongs to the candidate?
 *   evidenceQuality     — one of: strong / adequate / weak
 *   concerns            — one of: none / minor / significant (free-text in rationale)
 */
export const peerReviewRubricSchema = z.object({
  skillDemonstrated: z.boolean(),
  codeAuthorship:    z.boolean(),
  evidenceQuality:   z.enum(['strong', 'adequate', 'weak']),
  concerns:          z.enum(['none', 'minor', 'significant']),
})
export type PeerReviewRubric = z.infer<typeof peerReviewRubricSchema>

/**
 * A peer-review submission must cite at least one artifact URL and answer
 * every rubric question. The artifact URL must look like a real file / commit /
 * repository, not a top-level domain or unrelated page.
 *
 * Allowed artifact hosts for Phase 1: GitHub (commits, files, PRs, repos).
 * Anything else is rejected at the route layer so the reviewer is forced
 * to point at something the admin can click through to.
 */
export const peerReviewSubmitSchema = z.object({
  decision:   z.enum(['APPROVE', 'FLAG']),
  rationale:  z.string().trim().min(60, 'Rationale must be at least 60 characters').max(2000),
  artifactUrl: z.string().url().startsWith('https://', 'Artifact URL must be HTTPS'),
  rubric:     peerReviewRubricSchema,
})
export type PeerReviewSubmitInput = z.infer<typeof peerReviewSubmitSchema>
