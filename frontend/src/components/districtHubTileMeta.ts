/* Labels and copy for the district hub's KPI tiles (#1842), shared by the
   tiles (`DistrictHubTiles`), the hub's detail sheets (`DistrictOverviewHub`)
   and the `/district/:id` route fallback (#1901). Kept apart from the
   components so React Fast Refresh keeps working on them. */

export type HubTileKey =
  'paidClubs' | 'membershipPayments' | 'distinguishedClubs'

/* `label` is the tile's one-line name (a 160px tile at 375 fits ~16
   characters); `title` is the full name — read out with the tile, and the
   sheet's heading. */
export const HUB_BULLET_TILES: {
  key: HubTileKey
  title: string
  label: string
  about: string
}[] = [
  {
    key: 'paidClubs',
    title: 'Paid Clubs',
    label: 'Paid clubs',
    about:
      'Paid clubs count with thresholds for each Distinguished District recognition level.',
  },
  {
    key: 'membershipPayments',
    title: 'Membership Payments',
    label: 'Payments',
    about:
      'Total membership payments (New + April + October + Late + Charter) with thresholds for each Distinguished District recognition level.',
  },
  {
    key: 'distinguishedClubs',
    title: 'Distinguished Clubs',
    label: 'Distinguished',
    about:
      'Clubs achieving DCP goals + membership requirements with thresholds for each Distinguished District recognition level.',
  },
]

export const HUB_NET_TITLE = 'Net Member Change'
export const HUB_NET_LABEL = 'Net change'
export const HUB_NET_CAPTION = 'payments vs. program-year base'
export const HUB_NET_ABOUT =
  "Membership payments minus the program-year payment base (the recognition baseline). This differs from the Trends 'Net Change', which compares member counts against the first snapshot of the year."

export const HUB_DASH = '—'
