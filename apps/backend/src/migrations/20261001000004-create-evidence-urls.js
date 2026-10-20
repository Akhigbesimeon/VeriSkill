'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('evidence_urls', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      credential_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'credentials', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      url: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      provider_tier: {
        type: Sequelize.SMALLINT,
        allowNull: true,
      },
      provider_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      validation_status: {
        type: Sequelize.ENUM(
          'PENDING', 'VALID', 'UNVERIFIABLE', 'LOGIN_REQUIRED',
          'BLOCKED', 'INVALID_SCHEME', 'REDIRECT_LOOP',
          'DNS_FAILED', 'TIMEOUT', 'CONTENT_CHECK_FAILED'
        ),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      validation_result: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      evidence_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      last_checked_at: {
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

    await queryInterface.addIndex('evidence_urls', ['credential_id'], { name: 'evidence_urls_credential_id_idx' })
    await queryInterface.addIndex('evidence_urls', ['validation_status'], { name: 'evidence_urls_validation_status_idx' })
    await queryInterface.addIndex('evidence_urls', ['last_checked_at'], { name: 'evidence_urls_last_checked_at_idx' })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('evidence_urls')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_evidence_urls_validation_status";')
  },
}
