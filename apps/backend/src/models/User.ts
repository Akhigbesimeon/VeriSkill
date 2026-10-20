import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'developer'
  | 'peer_verifier'
  | 'expert_verifier'
  | 'administrator'
  | 'recruiter'

export type WalletType = 'managed' | 'self_custody'

export interface UserAttributes {
  id: string
  email: string
  passwordHash: string
  role: UserRole
  displayName: string
  bio: string | null
  location: string | null
  externalLinks: string[] | null   // Array of profile URLs
  company: string | null
  walletType: WalletType
  walletAddress: string | null     // null for managed wallets until key is generated
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

type UserCreationAttributes = Optional<
  UserAttributes,
  'id' | 'bio' | 'location' | 'externalLinks' | 'company' | 'walletAddress' | 'isActive'
>

// ─── Model ────────────────────────────────────────────────────────────────────

export class User extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes {
  declare id: string
  declare email: string
  declare passwordHash: string
  declare role: UserRole
  declare displayName: string
  declare bio: string | null
  declare location: string | null
  declare externalLinks: string[] | null
  declare company: string | null
  declare walletType: WalletType
  declare walletAddress: string | null
  declare isActive: boolean
  declare createdAt: Date
  declare updatedAt: Date
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    role: {
      type: DataTypes.ENUM(
        'developer', 'peer_verifier', 'expert_verifier', 'administrator', 'recruiter'
      ),
      allowNull: false,
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'display_name',
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    externalLinks: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'external_links',
      defaultValue: [],
    },
    company: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    walletType: {
      type: DataTypes.ENUM('managed', 'self_custody'),
      allowNull: false,
      field: 'wallet_type',
    },
    walletAddress: {
      type: DataTypes.STRING(42), // EVM address: 0x + 40 hex chars
      allowNull: true,
      field: 'wallet_address',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
  },
  {
    sequelize,
    tableName: 'users',
    underscored: true,
    indexes: [
      { fields: ['email'], unique: true },
      { fields: ['role'] },
      { fields: ['wallet_address'] },
    ],
  }
)

export default User
