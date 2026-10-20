'use strict'

/**
 * Tier 1 provider seed data — locked in Phase 0 Section 5.
 * These are the approved certification authorities for the MVP pilot.
 *
 * Tier 1: Direct API / well-structured public URL verification possible.
 * Tier 2: Verifiable via HTTP with metadata inspection.
 *
 * Do NOT edit this list without creating a new migration.
 * The admin UI (Phase 5) allows adding providers without code changes.
 */
const PROVIDERS = [
  // ── Tier 1 ────────────────────────────────────────────────────────────────
  { id: 'coursera',    name: 'Coursera',          hostname: 'coursera.org',       url_pattern: 'coursera.org/verify/*',     tier: 1 },
  { id: 'udemy',       name: 'Udemy',             hostname: 'udemy.com',          url_pattern: 'udemy.com/certificate/*',   tier: 1 },
  { id: 'linkedin_lc', name: 'LinkedIn Learning', hostname: 'linkedin.com',       url_pattern: 'linkedin.com/learning/certificates/*', tier: 1 },
  { id: 'credly',      name: 'Credly (Acclaim)',  hostname: 'credly.com',         url_pattern: 'credly.com/badges/*',       tier: 1 },
  { id: 'freecodecamp',name: 'freeCodeCamp',      hostname: 'freecodecamp.org',   url_pattern: 'freecodecamp.org/certification/*', tier: 1 },
  { id: 'pluralsight', name: 'Pluralsight',       hostname: 'pluralsight.com',    url_pattern: null,                        tier: 1 },
  { id: 'edx',         name: 'edX',               hostname: 'edx.org',            url_pattern: 'courses.edx.org/certificates/*', tier: 1 },
  { id: 'google_certs',name: 'Google Certificates',hostname:'grow.google',         url_pattern: null,                        tier: 1 },
  { id: 'aws_certs',   name: 'AWS Training',      hostname: 'aws.amazon.com',     url_pattern: 'aws.amazon.com/verification/*', tier: 1 },

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  { id: 'udacity',     name: 'Udacity',           hostname: 'udacity.com',        url_pattern: 'graduation.udacity.com/*',  tier: 2 },
  { id: 'codecademy',  name: 'Codecademy',        hostname: 'codecademy.com',     url_pattern: 'codecademy.com/profiles/*/certificates/*', tier: 2 },
  { id: 'hackerrank',  name: 'HackerRank',        hostname: 'hackerrank.com',     url_pattern: 'hackerrank.com/certificates/*', tier: 2 },
  { id: 'sololearn',   name: 'SoloLearn',         hostname: 'sololearn.com',      url_pattern: null,                        tier: 2 },
  { id: 'alison',      name: 'Alison',            hostname: 'alison.com',         url_pattern: null,                        tier: 2 },
]

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date()
    await queryInterface.bulkInsert('providers', PROVIDERS.map(p => ({
      ...p,
      is_active: true,
      created_at: now,
      updated_at: now,
    })))
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('providers', {
      id: PROVIDERS.map(p => p.id),
    })
  },
}
