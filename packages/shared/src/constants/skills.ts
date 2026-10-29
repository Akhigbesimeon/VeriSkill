/**
 * Approved skills — single source of truth for every workspace.
 * Must stay in sync with the `enum_credentials_skill` Postgres enum
 * (apps/backend/src/migrations/*-expand-credentials-skill-enum.js and
 * add-c-to-skill-enum.js). Adding a new skill: append here, write a
 * migration adding the enum value, then redeploy.
 */
export const APPROVED_SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Kotlin', 'Swift',
  'Go', 'Rust', 'C', 'C#', 'PHP', 'Ruby', 'Solidity',
  'HTML', 'CSS', 'SQL',
  'React', 'Node.js', 'Git', 'Docker',
  'Kubernetes', 'AWS', 'Terraform',
] as const

export type ApprovedSkill = (typeof APPROVED_SKILLS)[number]

export function isApprovedSkill(value: string): value is ApprovedSkill {
  return APPROVED_SKILLS.includes(value as ApprovedSkill)
}
