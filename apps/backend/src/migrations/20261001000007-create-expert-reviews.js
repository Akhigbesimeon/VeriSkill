'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('expert_reviews', {
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
      expert_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('ASSIGNED', 'SUBMITTED'),
        allowNull: false,
        defaultValue: 'ASSIGNED',
      },
      confidence_rating: { type: Sequelize.SMALLINT, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      assigned_at: { type: Sequelize.DATE, allowNull: false },
      submitted_at: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex('expert_reviews', ['credential_id'], { name: 'expert_reviews_credential_id_idx' })
    await queryInterface.addIndex('expert_reviews', ['expert_id'], { name: 'expert_reviews_expert_id_idx' })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('expert_reviews')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_expert_reviews_status";')
  },
}
