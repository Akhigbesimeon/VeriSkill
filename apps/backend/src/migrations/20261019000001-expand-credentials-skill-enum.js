'use strict'

/**
 * Expand enum_credentials_skill with the extended MVP skill list.
 * ADD VALUE is idempotent via IF NOT EXISTS (Postgres 9.6+).
 * Values cannot be removed from a Postgres enum, so down() is a no-op.
 */
const NEW_VALUES = [
  'TypeScript', 'Kotlin', 'Swift', 'Go', 'Rust', 'C', 'C#', 'PHP', 'Ruby',
  'HTML', 'CSS', 'SQL', 'Kubernetes', 'AWS', 'Terraform',
]

module.exports = {
  async up(queryInterface) {
    for (const v of NEW_VALUES) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_credentials_skill" ADD VALUE IF NOT EXISTS '${v}'`
      )
    }
  },

  async down() {
    // Postgres does not support removing values from an enum.
  },
}
