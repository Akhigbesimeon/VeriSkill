'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('trust_score_history', {
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
      old_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      new_score: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      old_layer: { type: Sequelize.SMALLINT, allowNull: false },
      new_layer: { type: Sequelize.SMALLINT, allowNull: false },
      trigger_event: { type: Sequelize.STRING(100), allowNull: false },
      score_breakdown: { type: Sequelize.JSONB, allowNull: false },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      // No updated_at — this table is append-only
    })

    await queryInterface.addIndex('trust_score_history', ['credential_id'], { name: 'trust_score_history_credential_id_idx' })
    await queryInterface.addIndex('trust_score_history', ['created_at'], { name: 'trust_score_history_created_at_idx' })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('trust_score_history')
  },
}
