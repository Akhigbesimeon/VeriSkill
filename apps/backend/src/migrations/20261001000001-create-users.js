'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      role: {
        type: Sequelize.ENUM(
          'developer', 'peer_verifier', 'expert_verifier', 'administrator', 'recruiter'
        ),
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      location: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      external_links: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      wallet_type: {
        type: Sequelize.ENUM('managed', 'self_custody'),
        allowNull: false,
      },
      wallet_address: {
        type: Sequelize.STRING(42),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('users', ['email'], { unique: true, name: 'users_email_unique' })
    await queryInterface.addIndex('users', ['role'], { name: 'users_role_idx' })
    await queryInterface.addIndex('users', ['wallet_address'], { name: 'users_wallet_address_idx' })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_wallet_type";')
  },
}
