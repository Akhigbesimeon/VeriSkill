'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('github_scans', {
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
      repo_url: { type: Sequelize.TEXT, allowNull: false },
      repo_name: { type: Sequelize.STRING(200), allowNull: false },
      owner: { type: Sequelize.STRING(100), allowNull: false },
      is_fork: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      languages: { type: Sequelize.JSONB, allowNull: true },
      frameworks: { type: Sequelize.JSONB, allowNull: true },
      health_score: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      health_breakdown: { type: Sequelize.JSONB, allowNull: true },
      skill_match_type: {
        type: Sequelize.ENUM('exact', 'partial', 'weak', 'none'),
        allowNull: true,
      },
      skill_match_score: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      commit_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      contributor_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_commit_at: { type: Sequelize.DATE, allowNull: true },
      scan_status: {
        type: Sequelize.ENUM('PENDING', 'COMPLETE', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      last_scanned_at: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex('github_scans', ['credential_id'], { name: 'github_scans_credential_id_idx' })
    await queryInterface.addIndex('github_scans', ['scan_status'], { name: 'github_scans_scan_status_idx' })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('github_scans')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_github_scans_skill_match_type";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_github_scans_scan_status";')
  },
}
