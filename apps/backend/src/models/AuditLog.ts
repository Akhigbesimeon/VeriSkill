import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

export interface AuditLogAttributes {
  id: string
  actorId: string | null          // null for system actions
  action: string                  // e.g. 'credential.minted', 'peer_review.assigned'
  resourceType: string            // e.g. 'credential', 'user', 'peer_review'
  resourceId: string              // UUID of the affected resource
  payload: Record<string, unknown> | null  // Changed fields (JSONB)
  ipHash: string | null           // SHA-256 of the request IP
  createdAt?: Date
}

type AuditLogCreationAttributes = Optional<
  AuditLogAttributes, 'id' | 'actorId' | 'payload' | 'ipHash'
>

export class AuditLog extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes {
  declare id: string
  declare actorId: string | null
  declare action: string
  declare resourceType: string
  declare resourceId: string
  declare payload: Record<string, unknown> | null
  declare ipHash: string | null
  declare createdAt: Date
}

AuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'actor_id',
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    resourceType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'resource_type',
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'resource_id',
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ipHash: {
      type: DataTypes.CHAR(64),
      allowNull: true,
      field: 'ip_hash',
    },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    underscored: true,
    updatedAt: false, // Append-only
    indexes: [
      { fields: ['actor_id'] },
      { fields: ['action'] },
      { fields: ['resource_type', 'resource_id'] },
      { fields: ['created_at'] },
    ],
  }
)

export default AuditLog
