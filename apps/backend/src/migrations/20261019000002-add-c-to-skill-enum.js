'use strict'

/** Follow-up to 20261019000001: 'C' was added after that migration ran. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_credentials_skill" ADD VALUE IF NOT EXISTS 'C'`
    )
  },
  async down() {
    // Postgres does not support removing enum values.
  },
}
