import { Sequelize } from 'sequelize'
import { env } from './env'

/**
 * Shared Sequelize instance used by all models.
 * Imported by models/index.ts and the migration runner.
 *
 * Connection pooling:
 *   max: 3  — sized for Supabase free-tier Supavisor pooler (ADR-013)
 *   min: 0  — do not hold idle connections against the shared pooler
 *   idle: 10s — release idle connections promptly on free tier
 *   acquire: 60s — fail fast if pool is exhausted
 */
const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: env.DATABASE_SSL
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
  pool: {
    max: 3,
    min: 0,
    idle: 10_000,
    acquire: 60_000,
  },
  logging: env.NODE_ENV === 'local' ? false : false,
  define: {
    // All tables use snake_case column names (via `underscored`). JS attribute
    // names remain camelCase (createdAt/updatedAt) so JSON responses match the
    // frontend's expectations.
    underscored: true,
    timestamps: true,
  },
})

export default sequelize
