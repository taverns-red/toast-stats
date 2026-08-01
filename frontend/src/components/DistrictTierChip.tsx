import React from 'react'
import type { DistinguishedDistrictTier } from '../services/cdn'
import { RecognitionBadge } from './recognition/RecognitionBadge'
import { tierRecognition } from './recognition/recognitionRegistry'

/**
 * Distinguished District tier badge.
 *
 * The tier vocabulary — label, colour, rare-tier flag — used to live here in a
 * local `TIER_CONFIG`, one of three independent descriptions of the same
 * recognition vocabulary. It moved to the shared registry in #1361; this
 * component is now the thin adapter that maps a CDN tier value onto a
 * `RecognitionBadge`, keeping the `tier-chip-<id>` testid and the `data-tier`
 * hook that #546's coverage and CSS both key off.
 */
interface Props {
  districtId: string
  tier: DistinguishedDistrictTier | null | undefined
}

export const DistrictTierChip: React.FC<Props> = ({ districtId, tier }) => {
  // Absence = signal: pre-Distinguished districts render nothing. This keeps
  // the row visually quiet while letting achieved districts pop — and it is
  // why pulling the Tier column left no empty `—` cell behind (#1361).
  const item = tierRecognition(tier)
  if (!item) return null
  return <RecognitionBadge item={item} testId={`tier-chip-${districtId}`} />
}

export default DistrictTierChip
