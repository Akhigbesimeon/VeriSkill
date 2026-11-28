'use strict'

/**
 * Peer-review integrity: add columns used by the eligibility, rubric,
 * bias and audit controls. All columns are nullable or have a default,
 * so existing rows remain valid without a backfill.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('peer_reviews', 'artifact_url', {
      type: Sequelize.TEXT,
      allowNull: true,
    })
    await queryInterface.addColumn('peer_reviews', 'rubric', {
      type: Sequelize.JSONB,
      allowNull: true,
    })
    await queryInterface.addColumn('peer_reviews', 'weight_factors', {
      type: Sequelize.JSONB,
      allowNull: true,
    })
    await queryInterface.addColumn('peer_reviews', 'reviewer_asn', {
      type: Sequelize.INTEGER,
      allowNull: true,
    })
    await queryInterface.addColumn('peer_reviews', 'flagged', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })

    await queryInterface.addIndex('peer_reviews', ['flagged'], {
      name: 'peer_reviews_flagged_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('peer_reviews', 'peer_reviews_flagged_idx')
    await queryInterface.removeColumn('peer_reviews', 'flagged')
    await queryInterface.removeColumn('peer_reviews', 'reviewer_asn')
    await queryInterface.removeColumn('peer_reviews', 'weight_factors')
    await queryInterface.removeColumn('peer_reviews', 'rubric')
    await queryInterface.removeColumn('peer_reviews', 'artifact_url')
  },
}
