import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * URL validation outcome states — defined in Phase 0, Section 6.
 * Each state maps to a user-facing label and a trust-score contribution.
 */
export type UrlValidationStatus =
  | 'PENDING'           // Not yet verified
  | 'VALID'             // Reachable, content check passed
  | 'UNVERIFIABLE'      // Failed twice (5xx/timeout); no score contribution
  | 'LOGIN_REQUIRED'    // Redirects to login page; unverifiable
  | 'BLOCKED'           // SSRF-blocked IP range or HTTPS requirement
  | 'INVALID_SCHEME'    // Not HTTPS
  | 'REDIRECT_LOOP'     // More than 3 redirects
  | 'DNS_FAILED'        // DNS resolution failed
  | 'TIMEOUT'           // 10s timeout exceeded
  | 'CONTENT_CHECK_FAILED' // Response did not indicate a valid certificate/badge

export type ProviderTier = 1 | 2

export interface EvidenceUrlAttributes {
  id: string
  credentialId: string
  url: string
  providerTier: ProviderTier | null  // null if provider is unknown
  providerId: string | null          // e.g. 'coursera', from providers table
  validationStatus: UrlValidationStatus
  validationResult: Record<string, unknown> | null  // Full validator output (JSONB)
  evidenceDate: Date | null          // Certificate issue date (user-declared)
  lastCheckedAt: Date | null
  createdAt?: Date
  updatedAt?: Date
}

type EvidenceUrlCreationAttributes = Optional<
  EvidenceUrlAttributes,
  'id' | 'providerTier' | 'providerId' | 'validationStatus' | 'validationResult' | 'evidenceDate' | 'lastCheckedAt'
>

// ─── Model ────────────────────────────────────────────────────────────────────

export class EvidenceUrl extends Model<EvidenceUrlAttributes, EvidenceUrlCreationAttributes>
  implements EvidenceUrlAttributes {
  declare id: string
  declare credentialId: string
  declare url: string
  declare providerTier: ProviderTier | null
  declare providerId: string | null
  declare validationStatus: UrlValidationStatus
  declare validationResult: Record<string, unknown> | null
  declare evidenceDate: Date | null
  declare lastCheckedAt: Date | null
  declare createdAt: Date
  declare updatedAt: Date
}

EvidenceUrl.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    credentialId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'credential_id',
      references: { model: 'credentials', key: 'id' },
      onDelete: 'CASCADE',
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { notEmpty: true },
    },
    providerTier: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      field: 'provider_tier',
    },
    providerId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'provider_id',
    },
    validationStatus: {
      type: DataTypes.ENUM(
        'PENDING', 'VALID', 'UNVERIFIABLE', 'LOGIN_REQUIRED',
        'BLOCKED', 'INVALID_SCHEME', 'REDIRECT_LOOP',
        'DNS_FAILED', 'TIMEOUT', 'CONTENT_CHECK_FAILED'
      ),
      allowNull: false,
      defaultValue: 'PENDING',
      field: 'validation_status',
    },
    validationResult: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'validation_result',
    },
    evidenceDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'evidence_date',
    },
    lastCheckedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_checked_at',
    },
  },
  {
    sequelize,
    tableName: 'evidence_urls',
    underscored: true,
    indexes: [
      { fields: ['credential_id'] },
      { fields: ['validation_status'] },
      { fields: ['last_checked_at'] },
    ],
  }
)

export default EvidenceUrl
