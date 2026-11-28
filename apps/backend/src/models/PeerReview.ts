import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewerType = 'internal' | 'external'
export type PeerReviewStatus = 'ASSIGNED' | 'SUBMITTED' | 'FLAGGED' | 'EXPIRED'
export type PeerReviewDecision = 'APPROVE' | 'FLAG'

/**
 * Structured per-review audit record of why the review got its final weight.
 * Written at submit time. Admin-only (see GET /admin/peer-reviews/:id/factors).
 */
export interface PeerReviewWeightFactors {
  base: number                  // starting weight (collusion + mutual)
  skillMatch: boolean           // same skill as credential, L3+
  agreementRate: number | null  // 0–1 vs expert outcomes; null when no history
  cluster: string               // ASN#<n> when known, else IP#<hash12>
  fastSubmit: boolean           // flagged as suspiciously fast
  nearDuplicate: boolean        // text overlap with reviewer's prior submission
  flagged: boolean              // any of the soft heuristics tripped
  final: number                 // persisted weightFactor after all factors applied
}

export interface PeerReviewAttributes {
  id: string
  credentialId: string
  reviewerId: string
  reviewerType: ReviewerType
  status: PeerReviewStatus
  decision: PeerReviewDecision | null
  rationale: string | null
  artifactUrl: string | null
  rubric: Record<string, unknown> | null
  weightFactor: number
  weightFactors: PeerReviewWeightFactors | null
  reviewerIpHash: string | null
  reviewerAsn: number | null
  flagged: boolean
  assignedAt: Date
  submittedAt: Date | null
  expiresAt: Date
  createdAt?: Date
  updatedAt?: Date
}

type PeerReviewCreationAttributes = Optional<
  PeerReviewAttributes,
  'id' | 'decision' | 'rationale' | 'artifactUrl' | 'rubric'
  | 'weightFactor' | 'weightFactors' | 'reviewerIpHash' | 'reviewerAsn'
  | 'flagged' | 'submittedAt'
>

// ─── Model ────────────────────────────────────────────────────────────────────

export class PeerReview extends Model<PeerReviewAttributes, PeerReviewCreationAttributes>
  implements PeerReviewAttributes {
  declare id: string
  declare credentialId: string
  declare reviewerId: string
  declare reviewerType: ReviewerType
  declare status: PeerReviewStatus
  declare decision: PeerReviewDecision | null
  declare rationale: string | null
  declare artifactUrl: string | null
  declare rubric: Record<string, unknown> | null
  declare weightFactor: number
  declare weightFactors: PeerReviewWeightFactors | null
  declare reviewerIpHash: string | null
  declare reviewerAsn: number | null
  declare flagged: boolean
  declare assignedAt: Date
  declare submittedAt: Date | null
  declare expiresAt: Date
  declare createdAt: Date
  declare updatedAt: Date
}

PeerReview.init(
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
    reviewerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'reviewer_id',
      references: { model: 'users', key: 'id' },
    },
    reviewerType: {
      type: DataTypes.ENUM('internal', 'external'),
      allowNull: false,
      field: 'reviewer_type',
    },
    status: {
      type: DataTypes.ENUM('ASSIGNED', 'SUBMITTED', 'FLAGGED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'ASSIGNED',
    },
    decision: {
      type: DataTypes.ENUM('APPROVE', 'FLAG'),
      allowNull: true,
    },
    rationale: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    artifactUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'artifact_url',
    },
    rubric: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    weightFactor: {
      // 0.00–1.00 (fine-grained now that agreementRate is a multiplier).
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 1.0,
      field: 'weight_factor',
      validate: { min: 0, max: 1 },
    },
    weightFactors: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'weight_factors',
    },
    reviewerIpHash: {
      type: DataTypes.CHAR(64), // SHA-256 hex
      allowNull: true,
      field: 'reviewer_ip_hash',
    },
    reviewerAsn: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'reviewer_asn',
    },
    flagged: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'assigned_at',
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'submitted_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
  },
  {
    sequelize,
    tableName: 'peer_reviews',
    underscored: true,
    indexes: [
      { fields: ['credential_id'] },
      { fields: ['reviewer_id'] },
      { fields: ['status'] },
      { fields: ['expires_at'] },
      { fields: ['flagged'] },
      // Prevent assigning the same reviewer to a credential twice
      { fields: ['credential_id', 'reviewer_id'], unique: true },
    ],
  }
)

export default PeerReview
