/**
 * Sequelize CLI database configuration.
 * This is a plain JS file (not TypeScript) so sequelize-cli can load it
 * directly without ts-node compilation.
 *
 * Migrations prefer DATABASE_MIGRATION_URL (direct 5432 connection) when set —
 * Supabase's Supavisor transaction pooler on port 6543 does not support the
 * long-running DDL + session-level state used by migrations (ADR-013).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') })

const url =
  process.env.DATABASE_MIGRATION_URL ||
  process.env.DATABASE_URL ||
  'postgresql://veriskill:password@localhost:5432/veriskill_dev'

const base = {
  url,
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.DATABASE_SSL === 'true'
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
  logging: false,
}

module.exports = {
  local:      base,
  development: base,
  test: {
    ...base,
    url: process.env.DATABASE_TEST_URL ||
      'postgresql://veriskill:password@localhost:5432/veriskill_test',
    logging: false,
  },
  staging:    { ...base, logging: false },
  production: { ...base, logging: false },
}
