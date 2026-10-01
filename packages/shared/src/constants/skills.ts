/**
 * Approved MVP skills — the eight in-scope skills for the VeriSkill pilot.
 * Only these values are accepted for skill assertions and credential creation.
 * Adding a new skill requires a client decision and an update to this file.
 */
export const APPROVED_SKILLS = [
  'JavaScript',
  'Python',
  'Java',
  'Solidity',
  'React',
  'Node.js',
  'Git',
  'Docker',
] as const

export type ApprovedSkill = (typeof APPROVED_SKILLS)[number]

export function isApprovedSkill(value: string): value is ApprovedSkill {
  return APPROVED_SKILLS.includes(value as ApprovedSkill)
}
