import React from 'react'
import { MobileRowList, type MobileRow } from '../MobileRowList'
import { PinSwatch } from './PinSwatch'
import type { ModeModel } from './pinModes'
import {
  regionClubMetricText,
  type RegionClub,
  type RegionMetric,
} from '../../utils/regionClubs'

/* The region explorer's ranked list (#1808): the screen-reader and
   keyboard alternative to the map. The shared MobileRowList rows at every
   width — 56–64 px whole-row links to each club's page, ≥ 44 px targets,
   50 then "Show 25 more", so the DOM holds at most the rows in view of the
   control. The chip is the club's pin in the current colour mode (shape +
   words, never colour alone); line 2 is the district and the ranked
   metric. An on-demand chunk the page fetches on mount, with the shard. */

export const RegionClubList: React.FC<{
  clubs: readonly RegionClub[]
  model: ModeModel
  metric: RegionMetric
  label: string
}> = ({ clubs, model, metric, label }) => {
  const rows: MobileRow[] = clubs.map(c => {
    const cat = model.categoryOf(c)
    return {
      id: c.clubId,
      to: `/district/${c.districtId}/club/${c.clubId}`,
      title: c.clubName,
      chip: (
        <span className="map-row-chip">
          <PinSwatch category={cat} />
          {cat.label}
        </span>
      ),
      meta: `D${c.districtId} · ${regionClubMetricText(c, metric)}`,
    }
  })
  return (
    <MobileRowList
      label={label}
      noun="clubs"
      chipPlacement="meta"
      rows={rows}
      flush
    />
  )
}

export default RegionClubList
