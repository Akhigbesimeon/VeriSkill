import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScanStatus = 'PENDING' | 'COMPLETE' | 'FAILED'
export type SkillMatchType = 'exact' | 'partial' | 'weak' | 'none'

export interface GithubScanAttributes {
  id: string
  credentialId: string
  repoUrl: string
  repoName: string      // owner/repo
  owner: string
  isFork: boolean
  languages: Record<string, number> | null   // { "JavaScript": 72.4, "CSS": 27.6 }
  frameworks: string[] | null                // ["React", "Express"]
  healthScore: number                        // 0–100 composite
  healthBreakdown: Record<string, number> | null // { readme: 10, licence: 5, ... }
  skillMatchType: SkillMatchType | null
  skillMatchScore: number                    // 0, 1, 3, or 6
  commitCount: number
  contributorCount: number
  lastCommitAt: Date | null
  scanStatus: ScanStatus
  lastScannedAt: Date | null
  createdAt?: Date
  updatedAt?: Date
}

type GithubScanCreationAttributes = Optional<
  GithubScanAttributes,
  | 'id' | 'languages' | 'frameworks' | 'healthScore' | 'healthBreakdown'
  | 'skillMatchType' | 'skillMatchScore' | 'commitCount' | 'contributorCount'
  | 'lastCommitAt' | 'scanStatus' | 'lastScannedAt'
>

// ─── Model ────────────────────────────────────────────────────────────────────

export class GithubScan extends Model<GithubScanAttributes, GithubScanCreationAttributes>
  implements GithubScanAttributes {
  declare id: string
  declare credentialId: string
  declare repoUrl: string
  declare repoName: string
  declare owner: string
  declare isFork: boolean
  declare languages: Record<string, number> | null
  declare frameworks: string[] | null
  declare healthScore: number
  declare healthBreakdown: Record<string, number> | null
  declare skillMatchType: SkillMatchType | null
  declare skillMatchScore: number
  declare commitCount: number
  declare contributorCount: number
  declare lastCommitAt: Date | null
  declare scanStatus: ScanStatus
  declare lastScannedAt: Date | null
  declare createdAt: Date
  declare updatedAt: Date
}

GithubScan.init(
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
    repoUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'repo_url',
    },
    repoName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'repo_name',
    },
    owner: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    isFork: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_fork',
    },
    languages: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    frameworks: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    healthScore: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
      field: 'health_score',
      validate: { min: 0, max: 100 },
    },
    healthBreakdown: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'health_breakdown',
    },
    skillMatchType: {
      type: DataTypes.ENUM('exact', 'partial', 'weak', 'none'),
      allowNull: true,
      field: 'skill_match_type',
    },
    skillMatchScore: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
      field: 'skill_match_score',
    },
    commitCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'commit_count',
    },
    contributorCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'contributor_count',
    },
    lastCommitAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_commit_at',
    },
    scanStatus: {
      type: DataTypes.ENUM('PENDING', 'COMPLETE', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING',
      field: 'scan_status',
    },
    lastScannedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_scanned_at',
    },
  },
  {
    sequelize,
    tableName: 'github_scans',
    underscored: true,
    indexes: [
      { fields: ['credential_id'] },
      { fields: ['scan_status'] },
    ],
  }
)

export default GithubScan
