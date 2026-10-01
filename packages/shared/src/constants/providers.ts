/**
 * Evidence provider allowlist — Tier 1 providers with structured verify pages.
 * Tier 2 is any provider not on this list (accepted but labeled differently).
 *
 * Adding a new provider requires an admin action in the database.
 * This file defines the initial seed data for the MVP.
 */

export const TIER_1_PROVIDERS = [
  {
    id: 'coursera',
    name: 'Coursera',
    hostname: 'coursera.org',
    urlPattern: '/verify/',
    description: 'Coursera certificate verification pages',
  },
  {
    id: 'edx',
    name: 'edX',
    hostname: 'edx.org',
    urlPattern: '/certificates/',
    description: 'edX certificate pages',
  },
  {
    id: 'udacity',
    name: 'Udacity',
    hostname: 'udacity.com',
    urlPattern: '/certificate/',
    description: 'Udacity certificate pages',
  },
  {
    id: 'pok',
    name: 'POK',
    hostname: 'pok.io',
    urlPattern: null, // Structural JSON check used instead
    description: 'POK open badge credential pages',
  },
  {
    id: 'freecodecamp',
    name: 'freeCodeCamp',
    hostname: 'freecodecamp.org',
    urlPattern: '/certification/',
    description: 'freeCodeCamp certification pages',
  },
  {
    id: 'linkedin-learning',
    name: 'LinkedIn Learning',
    hostname: 'linkedin.com',
    urlPattern: '/learning/certificates/',
    description: 'LinkedIn Learning certificate pages',
  },
  {
    id: 'credly',
    name: 'Credly',
    hostname: 'credly.com',
    urlPattern: '/badges/',
    description: 'Credly badge pages',
  },
] as const

export type ProviderId = (typeof TIER_1_PROVIDERS)[number]['id']

/** URL shortener hostnames — must be expanded before processing. */
export const URL_SHORTENER_HOSTNAMES = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'ow.ly',
  'short.io',
  'rebrand.ly',
] as const
