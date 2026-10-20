import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewerType = 'internal' | 'external'
export type PeerReviewStatus = 'ASSIGNED' | 'SUBMITTED' | 'FLAGGED' | 'EXPIRED'
export type PeerReviewDecision = 'APPROVE' | 'FLAG'

export interface PeerReviewAttributes {
  id: string
  credentialId: string
  reviewerId: string
  reviewerType: ReviewerType
  status: PeerReviewStatus
  decision: PeerReviewDecision | null
  rationale: string | null
  /**
   * Anti-collusion weight factor (Phase 0 Section 4):
   *   1.0 — full weight (no conflict)
   *   0.5 — mutual review history > 1 (prior mutual reviews)
   *   0.0 — IP match with credential owner (flagged, admin notified)
   */
  weightFactor: number
  /**
   * SHA-256 hash of the reviewer's IP address.
   * We store the hash, not the raw IP, to satisfy data minimisation.
   * Used only for anti-collusion detection (IP match = weight 0).
   */
  reviewerIpHash: string | null
  assignedAt: Date
  submittedAt: Date | null
  expiresAt: Date
  createdAt?: Date
  updatedAt?: Date
}

type PeerReviewCreationAttributes = Optional<
  PeerReviewAttributes,
  'id' | 'decision' | 'rationale' | 'weightFactor' | 'reviewerIpHash' | 'submittedAt'
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
  declare weightFactor: number
  declare reviewerIpHash: string | null
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
    weightFactor: {
      type: DataTypes.DECIMAL(3, 2), // 0.00, 0.50, or 1.00
      allowNull: false,
      defaultValue: 1.0,
      field: 'weight_factor',
      validate: { min: 0, max: 1 },
    },
    reviewerIpHash: {
      type: DataTypes.CHAR(64), // SHA-256 hex
      allowNull: true,
      field: 'reviewer_ip_hash',
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
      // Prevent assigning the same reviewer to a credential twice
      { fields: ['credential_id', 'reviewer_id'], unique: true },
    ],
  }
)

export default PeerReview
