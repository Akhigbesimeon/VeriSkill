import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/sequelize'

export interface ProviderAttributes {
  id: string               // slug: 'coursera', 'edx', etc.
  name: string
  hostname: string
  urlPattern: string | null
  tier: 1 | 2
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

type ProviderCreationAttributes = Optional<ProviderAttributes, 'isActive'>

export class Provider extends Model<ProviderAttributes, ProviderCreationAttributes>
  implements ProviderAttributes {
  declare id: string
  declare name: string
  declare hostname: string
  declare urlPattern: string | null
  declare tier: 1 | 2
  declare isActive: boolean
  declare createdAt: Date
  declare updatedAt: Date
}

Provider.init(
  {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    hostname: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    urlPattern: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'url_pattern',
    },
    tier: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      validate: { min: 1, max: 2 },
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
    tableName: 'providers',
    underscored: true,
  }
)

export default Provider
