'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('peer_reviews', {
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
      reviewer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      reviewer_type: {
        type: Sequelize.ENUM('internal', 'external'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('ASSIGNED', 'SUBMITTED', 'FLAGGED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'ASSIGNED',
      },
      decision: {
        type: Sequelize.ENUM('APPROVE', 'FLAG'),
        allowNull: true,
      },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      weight_factor: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 1.0,
      },
      reviewer_ip_hash: { type: Sequelize.CHAR(64), allowNull: true },
      assigned_at: { type: Sequelize.DATE, allowNull: false },
      submitted_at: { type: Sequelize.DATE, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
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

    await queryInterface.addIndex('peer_reviews', ['credential_id'], { name: 'peer_reviews_credential_id_idx' })
    await queryInterface.addIndex('peer_reviews', ['reviewer_id'], { name: 'peer_reviews_reviewer_id_idx' })
    await queryInterface.addIndex('peer_reviews', ['status'], { name: 'peer_reviews_status_idx' })
    await queryInterface.addIndex('peer_reviews', ['expires_at'], { name: 'peer_reviews_expires_at_idx' })
    // Prevent duplicate assignments
    await queryInterface.addIndex('peer_reviews', ['credential_id', 'reviewer_id'], {
      unique: true,
      name: 'peer_reviews_credential_reviewer_unique',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('peer_reviews')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_peer_reviews_reviewer_type";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_peer_reviews_status";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_peer_reviews_decision";')
  },
}
