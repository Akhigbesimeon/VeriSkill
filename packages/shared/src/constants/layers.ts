/**
 * Verification layer definitions.
 * Maps directly to the six-layer model approved in Phase 0.
 * The trust-score band values are inclusive ranges.
 */

export const VERIFICATION_LAYERS = {
  SELF_DECLARED: {
    value: 1,
    name: 'Self-Declared',
    trustBandMin: 0,
    trustBandMax: 10,
    recruiterConfidence: 'Low — Consider with caution',
  },
  LINK_VERIFIED: {
    value: 2,
    name: 'Direct Link Verified',
    trustBandMin: 20,
    trustBandMax: 40,
    recruiterConfidence: 'Medium — Review evidence',
  },
  GITHUB_SCANNED: {
    value: 3,
    name: 'GitHub Repo Scanned',
    trustBandMin: 40,
    trustBandMax: 60,
    recruiterConfidence: 'Higher — System validated',
  },
  PEER_VERIFIED: {
    value: 4,
    name: 'Peer Verified',
    trustBandMin: 60,
    trustBandMax: 80,
    recruiterConfidence: 'High — Community trust',
  },
  COMMUNITY_VERIFIED: {
    value: 5,
    name: 'Community Verified',
    trustBandMin: 80,
    trustBandMax: 90,
    recruiterConfidence: 'Very High — Community endorsed',
  },
  EXPERT_VERIFIED: {
    value: 6,
    name: 'Expert Verified',
    trustBandMin: 90,
    trustBandMax: 100,
    recruiterConfidence: 'Highest — Expert validated',
  },
} as const

export type LayerKey = keyof typeof VERIFICATION_LAYERS
export type LayerValue = (typeof VERIFICATION_LAYERS)[LayerKey]['value']

/**
 * The 10–20% range is intentionally unassigned.
 * No layer produces a score in this range. This is by design.
 */
export const UNASSIGNED_BAND = { min: 10, max: 20 } as const

/** Minimum layer required before a credential can be minted on-chain. */
export const MIN_LAYER_TO_MINT = 4 as const
