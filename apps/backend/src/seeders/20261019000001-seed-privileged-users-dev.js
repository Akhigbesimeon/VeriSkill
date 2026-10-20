'use strict'

const bcrypt = require('bcryptjs')

/**
 * Dev-only fixture: a bootstrap administrator and one expert_verifier so the
 * admin panel, user-management flow, and expert-review flow can be exercised
 * locally without manual DB writes.
 *
 * Do not run against production. Change the passwords before promoting
 * this fixture to any shared environment.
 *
 * Up:   npx sequelize-cli db:seed --seed 20261019000001-seed-privileged-users-dev.js
 * Down: npx sequelize-cli db:seed:undo --seed 20261019000001-seed-privileged-users-dev.js
 */

const ADMIN_ID       = '33333333-3333-3333-3333-333333333333'
const EXPERT_ID      = '44444444-4444-4444-4444-444444444444'
const ADMIN_EMAIL    = 'admin-seed@veriskill.test'
const EXPERT_EMAIL   = 'expert-seed@veriskill.test'
const ADMIN_PASSWORD = 'AdminSeedPass!123'
const EXPERT_PASSWORD = 'ExpertSeedPass!123'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const [adminHash, expertHash] = await Promise.all([
      bcrypt.hash(ADMIN_PASSWORD, 12),
      bcrypt.hash(EXPERT_PASSWORD, 12),
    ])

    await queryInterface.bulkInsert('users', [
      {
        id:            ADMIN_ID,
        email:         ADMIN_EMAIL,
        password_hash: adminHash,
        role:          'administrator',
        display_name:  'Seeded Admin',
        wallet_type:   'managed',
        wallet_address: null,
        is_active:     true,
        created_at:    now,
        updated_at:    now,
      },
      {
        id:            EXPERT_ID,
        email:         EXPERT_EMAIL,
        password_hash: expertHash,
        role:          'expert_verifier',
        display_name:  'Seeded Expert',
        wallet_type:   'managed',
        wallet_address: null,
        is_active:     true,
        created_at:    now,
        updated_at:    now,
      },
    ])
  },

  async down(queryInterface) {
    const { Op } = require('sequelize')
    await queryInterface.bulkDelete('users', { id: { [Op.in]: [ADMIN_ID, EXPERT_ID] } })
  },
}
