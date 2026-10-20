'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('credentials', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      developer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      skill: {
        type: Sequelize.ENUM(
          'JavaScript', 'Python', 'Java', 'Solidity',
          'React', 'Node.js', 'Git', 'Docker'
        ),
        allowNull: false,
      },
      verification_layer: {
        type: Sequelize.SMALLINT,
        allowNull: false,
        defaultValue: 1,
      },
      lifecycle_status: {
        type: Sequelize.ENUM(
          'DRAFT', 'ACTIVE', 'PENDING_REVIEW', 'MINTED',
          'APPEALING', 'SUSPENDED', 'REVOKED', 'REJECTED'
        ),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      trust_score: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      token_id: {
        type: Sequelize.STRING(78),
        allowNull: true,
        unique: true,
      },
      commit_hash: {
        type: Sequelize.CHAR(66),
        allowNull: true,
      },
      on_chain_minted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addIndex('credentials', ['developer_id'], { name: 'credentials_developer_id_idx' })
    await queryInterface.addIndex('credentials', ['lifecycle_status'], { name: 'credentials_lifecycle_status_idx' })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('credentials')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_credentials_skill";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_credentials_lifecycle_status";')
  },
}
