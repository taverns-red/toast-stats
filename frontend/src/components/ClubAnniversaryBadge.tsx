import React from 'react'
import type { ClubAnniversary } from '../utils/clubAnniversary'

/* ClubAnniversaryBadge (#445) — quiet pill for non-milestone, gold
   badge for milestone years, animated countdown when within ±30 days.
   Sprint B RED stub. */

export interface ClubAnniversaryBadgeProps {
  anniversary: ClubAnniversary | null
  /** Charter date in display form for the tooltip. */
  charterDateLabel?: string
}

export const ClubAnniversaryBadge: React.FC<ClubAnniversaryBadgeProps> = () => {
  throw new Error('ClubAnniversaryBadge: not implemented (RED phase, #445)')
}
