import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Lifecycle status values — matches the state machine defined in Phase 0, Section 3.
 * On-chain, only layer (uint8) and status (uint8 ACTIVE/SUSPENDED/REVOKED) are stored.
 * These richer off-chain statuses drive the UI and peer-review flow.
 */
export type CredentialLifecycleStatus =
  | 'DRAFT'          // Created, no evidence submitted yet
  | 'ACTIVE'         // Evidence submitted, verification in progress
  | 'PENDING_REVIEW' // Awaiting peer or expert review
  | 'MINTED'         // Token ID assigned, credential is on-chain
  | 'APPEALING'      // Developer appealing a review outcome
  | 'SUSPENDED'      // Temporarily frozen by admin (mirrored from on-chain)
  | 'REVOKED'        // Permanently invalidated (mirrored from on-chain)
  | 'REJECTED'       // Expert or admin rejected; not mintable

export type ApprovedSkill =
  | 'JavaScript' | 'TypeScript' | 'Python' | 'Java' | 'Kotlin' | 'Swift'
  | 'Go' | 'Rust' | 'C' | 'C#' | 'PHP' | 'Ruby' | 'Solidity'
  | 'HTML' | 'CSS' | 'SQL'
  | 'React' | 'Node.js' | 'Git' | 'Docker'
  | 'Kubernetes' | 'AWS' | 'Terraform'

export interface CredentialAttributes {
  id: string
  developerId: string
  skill: ApprovedSkill
  verificationLayer: number          // 1–6
  lifecycleStatus: CredentialLifecycleStatus
  trustScore: number                 // 0–100
  tokenId: string | null             // BigInt stored as string; null until minted
  commitHash: string | null          // bytes32 hex; null until minted
  onChainMintedAt: Date | null
  createdAt?: Date
  updatedAt?: Date
}

type CredentialCreationAttributes = Optional<
  CredentialAttributes,
  'id' | 'verificationLayer' | 'trustScore' | 'tokenId' | 'commitHash' | 'onChainMintedAt'
>

// ─── Model ────────────────────────────────────────────────────────────────────

export class Credential extends Model<CredentialAttributes, CredentialCreationAttributes>
  implements CredentialAttributes {
  declare id: string
  declare developerId: string
  declare skill: ApprovedSkill
  declare verificationLayer: number
  declare lifecycleStatus: CredentialLifecycleStatus
  declare trustScore: number
  declare tokenId: string | null
  declare commitHash: string | null
  declare onChainMintedAt: Date | null
  declare createdAt: Date
  declare updatedAt: Date
}

Credential.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    developerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'developer_id',
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    skill: {
      type: DataTypes.ENUM(
        'JavaScript', 'TypeScript', 'Python', 'Java', 'Kotlin', 'Swift',
        'Go', 'Rust', 'C', 'C#', 'PHP', 'Ruby', 'Solidity',
        'HTML', 'CSS', 'SQL',
        'React', 'Node.js', 'Git', 'Docker',
        'Kubernetes', 'AWS', 'Terraform'
      ),
      allowNull: false,
    },
    verificationLayer: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 1,
      field: 'verification_layer',
      validate: { min: 1, max: 6 },
    },
    lifecycleStatus: {
      type: DataTypes.ENUM(
        'DRAFT', 'ACTIVE', 'PENDING_REVIEW', 'MINTED',
        'APPEALING', 'SUSPENDED', 'REVOKED', 'REJECTED'
      ),
      allowNull: false,
      defaultValue: 'DRAFT',
      field: 'lifecycle_status',
    },
    trustScore: {
      type: DataTypes.DECIMAL(5, 2), // 000.00 — sufficient for 0.00–100.00
      allowNull: false,
      defaultValue: 0,
      field: 'trust_score',
      validate: { min: 0, max: 100 },
      // Postgres DECIMAL arrives as a string from node-postgres; coerce so the
      // typed `number` isn't a lie and frontend arithmetic (NaN avg) works.
      get() {
        const raw = this.getDataValue('trustScore') as unknown
        return raw == null ? raw : Number(raw)
      },
    },
    tokenId: {
      type: DataTypes.STRING(78), // uint256 max is 78 decimal digits; stored as string
      allowNull: true,
      field: 'token_id',
    },
    commitHash: {
      type: DataTypes.CHAR(66), // '0x' + 64 hex chars
      allowNull: true,
      field: 'commit_hash',
    },
    onChainMintedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'on_chain_minted_at',
    },
  },
  {
    sequelize,
    tableName: 'credentials',
    underscored: true,
    indexes: [
      { fields: ['developer_id'] },
      { fields: ['lifecycle_status'] },
      { fields: ['token_id'], unique: true, where: { token_id: { $ne: null } } },
    ],
  }
)

export default Credential
