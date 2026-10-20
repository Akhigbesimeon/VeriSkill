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
  }
}
