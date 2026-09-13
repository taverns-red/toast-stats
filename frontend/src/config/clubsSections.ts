/* The canonical, ordered list of `/clubs` section routes (#1556), the sibling
   of `districtSections`. Lives in config so the nav (ClubsSubnav) and any
   non-UI consumer share one source of truth.

   ADR-005 §2: every item is a REAL route — the Overview hub and one race page
   per Distinguished tier — never a client-side tab. */

import type { ClubRaceTier } from '@taverns-red/shared-contracts'
import { RACE_TIER_ROUTES, raceTierUrl } from '../utils/raceTierRoute'

export interface ClubsSection {
  /** Visible label. */
  label: string
  /** Absolute path. */
  path: string
  /** NavLink `end` — the hub is active only at its exact URL. */
  end: boolean
}

const SHORT_LABELS: Record<ClubRaceTier, string> = {
  Distinguished: 'Distinguished',
  Select: 'Select',
  President: "President's",
  Smedley: 'Smedley',
}

export const CLUBS_HUB_PATH = '/clubs'

export const CLUBS_SECTIONS: readonly ClubsSection[] = [
  { label: 'Overview', path: CLUBS_HUB_PATH, end: true },
  ...RACE_TIER_ROUTES.map(({ tier }) => ({
    label: SHORT_LABELS[tier],
    path: raceTierUrl(tier),
    end: false,
  })),
]
