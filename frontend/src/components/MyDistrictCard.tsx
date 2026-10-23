/* MyDistrictCard (#2249) — under the hero search, the starred district as
   ONE tappable card: chip + name, rank in the field, and movement since the
   last visit. It stores nothing new: the my-district star (#417) and the
   last-visit diff (#418) are the page's existing state.

   The card is data-fed (rank needs the rankings), so the loading shell
   renders `MyDistrictCardReserve` — the same box, no link — whenever a
   star is set, and the data landing moves nothing (Lesson 107). */

import React from 'react'
import { Link } from 'react-router-dom'
import { DistrictChipAndName } from './DistrictChipAndName'

export interface MyDistrictCardProps {
  districtId: string
  districtName: string
  /** null = the starred district is not in this year's rankings (a
      consolidated or older district) — the card still links to it, so the
      shell's reserve never collapses (review S10). */
  rank: number | null
  total: number
  /** Positive = moved up since the last visit; null = no previous visit. */
  rankDelta: number | null
  previousDate: string | null
  /** The rankings' as-of date. A last visit on this same date is not a
      comparison, so no movement line is shown (review S10). */
  asOfDate?: string | null
}

function movement(delta: number, previousDate: string | null): string {
  const since = previousDate ? ` since ${previousDate}` : ' since last visit'
  if (delta === 0) return `No change${since}`
  const n = Math.abs(delta)
  const places = n === 1 ? 'place' : 'places'
  return `${delta > 0 ? 'Up' : 'Down'} ${n} ${places}${since}`
}

export const MyDistrictCard: React.FC<MyDistrictCardProps> = ({
  districtId,
  districtName,
  rank,
  total,
  rankDelta,
  previousDate,
  asOfDate,
}) => (
  <Link
    to={`/district/${districtId}`}
    className="my-district-card"
    data-testid="my-district-card"
  >
    <span className="my-district-card__eyebrow">Your district</span>
    <span className="my-district-card__who">
      <DistrictChipAndName
        districtId={districtId}
        name={districtName}
        nameClassName="my-district-card__name"
      />
    </span>
    <span className="my-district-card__rank">
      {rank === null
        ? "Not in this year's rankings"
        : `Rank #${rank} of ${total}`}
    </span>
    <span className="my-district-card__move">
      {rankDelta === null ||
      rank === null ||
      (!!asOfDate && previousDate === asOfDate)
        ? ''
        : movement(rankDelta, previousDate)}
    </span>
    <span className="my-district-card__go" aria-hidden="true">
      →
    </span>
  </Link>
)

/** The loading shell's same-box reserve: no link, no numbers. */
export const MyDistrictCardReserve: React.FC = () => (
  <div
    className="my-district-card my-district-card--reserve"
    aria-hidden="true"
  >
    <span className="my-district-card__eyebrow">Your district</span>
    <span className="my-district-card__who">
      <span className="district-number-chip my-district-card__chip-reserve" />
    </span>
    <span className="my-district-card__rank">Rank</span>
    <span className="my-district-card__move" />
  </div>
)
