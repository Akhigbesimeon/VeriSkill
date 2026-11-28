// Augment the Express Request interface with VeriSkill-specific fields
// so TypeScript knows about properties we attach in middleware.
declare namespace Express {
  interface Request {
    requestId: string
    user?: {
      id: string
      email: string
      role: import('./models/User').UserRole
    }
    // Short, non-reversible identifier for the authenticated recruiter API
    // key (first 12 hex chars of its SHA-256). Used by the per-key rate
    // limiter and for auditing. Unset on unauthenticated requests.
    apiKeyId?: string
  }
}
