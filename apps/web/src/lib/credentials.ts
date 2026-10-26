export type BadgeVariant = 'default' | 'info' | 'warning' | 'success' | 'danger'

export function statusVariant(s: string): BadgeVariant {
  const m: Record<string, BadgeVariant> = {
    DRAFT: 'default', ACTIVE: 'info', PENDING_REVIEW: 'warning',
    MINTED: 'success', SUSPENDED: 'warning', REVOKED: 'danger', REJECTED: 'danger',
  }
  return m[s] ?? 'default'
}

export const RATING_LABELS: Record<number, string> = {
  1: 'Marginal', 2: 'Acceptable', 3: 'Solid', 4: 'Strong', 5: 'Exceptional',
}
