'use strict'

const bcrypt = require('bcryptjs')

/**
 * Dev-only fixture: a developer with a MINTED credential, so the mobile
 * QR scanner, verify endpoint, and web share card can be exercised end
 * to end without running the full dev → evidence → peer review → mint
 * flow. The on-chain fields (token_id, commit_hash, on_chain_minted_at)
 * are deliberately fake values — this fixture does not interact with
 * the chain.
 *
 * Do not run against production.
 *
 * Up:   npx sequelize-cli db:seed --seed 20261015000001-seed-minted-credential-dev.js
 * Down: npx sequelize-cli db:seed:undo --seed 20261015000001-seed-minted-credential-dev.js
 */

const DEV_USER_ID       = '11111111-1111-1111-1111-111111111111'
const CREDENTIAL_ID     = '22222222-2222-2222-2222-222222222222'
const DEV_EMAIL         = 'dev-seed@veriskill.test'
const DEV_PASSWORD      = 'DevSeedPass!123'
const FAKE_WALLET       = '0x0000000000000000000000000000000000000001'
const FAKE_COMMIT_HASH  = '0x' + 'de'.repeat(32) // 66-char hex, matches CHAR(66)

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10)

    await queryInterface.bulkInsert('users', [{
      id:              DEV_USER_ID,
      email:           DEV_EMAIL,
      password_hash:   passwordHash,
      role:            'developer',
      display_name:    'Seeded Developer',
      wallet_type:     'managed',
      wallet_address:  FAKE_WALLET,
      is_active:       true,
      created_at:      now,
      updated_at:      now,
    }])

    await queryInterface.bulkInsert('credentials', [{
      id:                  CREDENTIAL_ID,
      developer_id:        DEV_USER_ID,
      skill:               'React',
      verification_layer:  5,
      lifecycle_status:    'MINTED',
      trust_score:         85.00,
      token_id:            '1',
      commit_hash:         FAKE_COMMIT_HASH,
      on_chain_minted_at:  now,
      created_at:          now,
      updated_at:          now,
    }])
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('credentials', { id: CREDENTIAL_ID })
    await queryInterface.bulkDelete('users',       { id: DEV_USER_ID })
  },
}
