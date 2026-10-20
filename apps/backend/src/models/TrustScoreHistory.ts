import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

export interface TrustScoreHistoryAttributes {
  id: string
  credentialId: string
  oldScore: number
  newScore: number
  oldLayer: number
  newLayer: number
  triggerEvent: string               // e.g. 'url_validated', 'peer_approved', 'github_scanned'
  scoreBreakdown: Record<string, unknown>  // Full sub-score detail (JSONB)
  createdAt?: Date
  // No updatedAt — this table is append-only
}

type TrustScoreHistoryCreationAttributes = Optional<TrustScoreHistoryAttributes, 'id'>

export class TrustScoreHistory
  extends Model<TrustScoreHistoryAttributes, TrustScoreHistoryCreationAttributes>
  implements TrustScoreHistoryAttributes {
  declare id: string
  declare credentialId: string
  declare oldScore: number
  declare newScore: number
  declare oldLayer: number
  declare newLayer: number
  declare triggerEvent: string
  declare scoreBreakdown: Record<string, unknown>
  declare createdAt: Date
}

TrustScoreHistory.init(
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
    oldScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      field: 'old_score',
    },
    newScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      field: 'new_score',
    },
    oldLayer: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: 'old_layer',
    },
    newLayer: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: 'new_layer',
    },
    triggerEvent: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'trigger_event',
    },
    scoreBreakdown: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'score_breakdown',
    },
  },
  {
    sequelize,
    tableName: 'trust_score_history',
    underscored: true,
    updatedAt: false, // Append-only — no updates ever
    indexes: [
      { fields: ['credential_id'] },
      { fields: ['created_at'] },
    ],
  }
)

export default TrustScoreHistory
