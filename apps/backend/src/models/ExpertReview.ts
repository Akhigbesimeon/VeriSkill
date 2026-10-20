import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

export type ExpertReviewStatus = 'ASSIGNED' | 'SUBMITTED'

export interface ExpertReviewAttributes {
  id: string
  credentialId: string
  expertId: string
  status: ExpertReviewStatus
  /**
   * Expert confidence rating (Phase 0, Section 4 — Layer 6 sub-scores):
   *   1 — Marginal   (+0 points)
   *   2 — Acceptable (+2 points)
   *   3 — Solid      (+5 points)
   *   4 — Strong     (+7 points)
   *   5 — Exceptional (+10 points)
   */
  confidenceRating: number | null
  notes: string | null
  assignedAt: Date
  submittedAt: Date | null
  createdAt?: Date
  updatedAt?: Date
}

type ExpertReviewCreationAttributes = Optional<
  ExpertReviewAttributes,
  'id' | 'confidenceRating' | 'notes' | 'submittedAt'
>

export class ExpertReview extends Model<ExpertReviewAttributes, ExpertReviewCreationAttributes>
  implements ExpertReviewAttributes {
  declare id: string
  declare credentialId: string
  declare expertId: string
  declare status: ExpertReviewStatus
  declare confidenceRating: number | null
  declare notes: string | null
  declare assignedAt: Date
  declare submittedAt: Date | null
  declare createdAt: Date
  declare updatedAt: Date
}

ExpertReview.init(
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
    expertId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'expert_id',
      references: { model: 'users', key: 'id' },
    },
    status: {
      type: DataTypes.ENUM('ASSIGNED', 'SUBMITTED'),
      allowNull: false,
      defaultValue: 'ASSIGNED',
    },
    confidenceRating: {
      type: DataTypes.SMALLINT,
      allowNull: true,
      field: 'confidence_rating',
      validate: { min: 1, max: 5 },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
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
  },
  {
    sequelize,
    tableName: 'expert_reviews',
    underscored: true,
    indexes: [
      { fields: ['credential_id'] },
      { fields: ['expert_id'] },
    ],
  }
)

export default ExpertReview
