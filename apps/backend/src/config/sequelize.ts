import { Sequelize } from 'sequelize'
import { env } from './env'

/**
 * Shared Sequelize instance used by all models.
 * Imported by models/index.ts and the migration runner.
 *
 * Pool sized against self-hosted Postgres (max_connections=30 on server),
 * leaving headroom for migrations, workers, and backups.
 */
const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: env.DATABASE_SSL
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
  pool: {
    max: 10,
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
