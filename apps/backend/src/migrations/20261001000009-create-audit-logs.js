'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      actor_id: { type: Sequelize.UUID, allowNull: true },
      action: { type: Sequelize.STRING(100), allowNull: false },
      resource_type: { type: Sequelize.STRING(50), allowNull: false },
      resource_id: { type: Sequelize.UUID, allowNull: false },
      payload: { type: Sequelize.JSONB, allowNull: true },
      ip_hash: { type: Sequelize.CHAR(64), allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      // No updated_at — append-only
    })

    await queryInterface.addIndex('audit_logs', ['actor_id'], { name: 'audit_logs_actor_id_idx' })
    await queryInterface.addIndex('audit_logs', ['action'], { name: 'audit_logs_action_idx' })
    await queryInterface.addIndex('audit_logs', ['resource_type', 'resource_id'], { name: 'audit_logs_resource_idx' })
    await queryInterface.addIndex('audit_logs', ['created_at'], { name: 'audit_logs_created_at_idx' })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs')
  },
}
