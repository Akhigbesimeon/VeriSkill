import { z } from 'zod'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env from the repo root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

/**
 * Validated environment variables for the backend.
 *
 * All secrets and configuration are declared here.
 * The application will fail at startup (not silently at runtime)
 * if any required variable is missing or malformed.
 *
 * Zod validates types and provides clear error messages.
 * Every variable maps 1:1 to a key in .env.example.
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['local', 'development', 'staging', 'production', 'test']).default('local'),
  PORT: z.coerce.number().int().min(1000).max(65535).default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Database
  // DATABASE_URL — runtime pool (Supabase Supavisor pooler, port 6543)
  // DATABASE_MIGRATION_URL — direct connection used by sequelize-cli (port 5432)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z.string().transform(v => v === 'true').default('false'),
  DATABASE_TEST_URL: z.string().optional(),
  DATABASE_MIGRATION_URL: z.string().optional(),

  // Scheduled jobs
  // Shared secret sent as `Authorization: Bearer <CRON_SECRET>` by
  // Supabase pg_cron when it calls internal cron webhook endpoints (ADR-016).
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),

  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Shared secret the mobile app sends as `X-Mobile-Key`. When set, requests
  // carrying it are treated as mobile and locked to the recruiter role. When
  // unset, no request is treated as mobile — safe default for existing envs.
  MOBILE_API_KEY: z.string().min(32).optional(),

  // Blockchain
  RPC_URL: z.string().url().default('http://127.0.0.1:8545'),
  CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid EVM address'),
  ISSUER_PRIVATE_KEY: z.string().min(1, 'ISSUER_PRIVATE_KEY is required'),
  ADMIN_PRIVATE_KEY: z.string().optional(),

  // EAS — Ethereum Attestation Service (Sepolia defaults; override per network)
  EAS_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default('0xC2679fBD37d54388Ce493F1DB75320D236e1815e'),
  EAS_SCHEMA_UID: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'EAS_SCHEMA_UID must be a 32-byte hex (set by deploy script output)'),

  // GitHub
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  // When true, github-scan.service augments the local health score with the
  // OpenSSF Scorecard public API. Scores can be days-stale; use as bonus only.
  OPENSSF_SCORECARD_ENABLED: z.string().transform(v => v === 'true').default('false'),

  // Peer-review anti-collusion — MaxMind GeoLite2 (free account required)
  // Path to a GeoLite2-ASN.mmdb file. If unset, ASN checks are skipped.
  MAXMIND_ASN_DB_PATH: z.string().optional(),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // URL verification
  URL_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  URL_FETCH_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(2_097_152),
  URL_FETCH_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(3),
})

function validateEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Environment variable validation failed:')
    console.error(result.error.format())
    process.exit(1)
  }
  return result.data
}

export const env = validateEnv()
