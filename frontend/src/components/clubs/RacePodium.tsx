import React from 'react'
import { Link } from 'react-router-dom'
import type {
  ClubRaceTier,
  GlobalClubRaceReached,
} from '@taverns-red/shared-contracts'
import { raceTierTitle } from '../../utils/raceTierRoute'
import { reachWindowCopy } from '../../utils/reachWindowCopy'

/* #1556 — the podium for one tier: the first three RANKS, not the first three
   clubs. Competition ranking makes ties honest (every club over the line on
   the first observed date is rank 1), so a tie renders as ONE rank entry with
   the clubs stacked under it — never three "1st" cards. The DOM is an <ol> of
   ranks (screen readers get the order for free); the cards are presentation.
   Rank 1 carries the --rt-stats accent, and never colour alone: the ordinal
   label is always present. */

export interface RacePodiumProps {
  tier: ClubRaceTier
  rows: readonly GlobalClubRaceReached[]
  /** How many ranks to show. */
  places?: number
}

interface RankGroup {
  rank: number
  reachedOn: string
  observedAfter: string | null
  clubs: GlobalClubRaceReached[]
}

export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

export function groupByRank(
  tier: ClubRaceTier,
  rows: readonly GlobalClubRaceReached[]
): RankGroup[] {
  const groups = new Map<number, RankGroup>()
  for (const row of rows) {
    const standing = row.tiers[tier]
    if (!standing) continue
    const group = groups.get(standing.rank) ?? {
      rank: standing.rank,
      reachedOn: standing.reachedOn,
      observedAfter: standing.observedAfter,
      clubs: [],
    }
    group.clubs.push(row)
    groups.set(standing.rank, group)
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank)
    .map(group => ({
      ...group,
      clubs: [...group.clubs].sort((a, b) =>
        a.clubName.localeCompare(b.clubName)
      ),
    }))
}

export const RacePodium: React.FC<RacePodiumProps> = ({
  tier,
  rows,
  places = 3,
}) => {
  const title = raceTierTitle(tier)
  const groups = groupByRank(tier, rows).slice(0, places)

  if (groups.length === 0) {
    return (
      <p className="race-podium__empty" data-testid="race-podium-empty">
        No club has reached {title} yet this program year.
      </p>
    )
  }

  return (
    <ol className="race-podium" aria-label={`First to ${title}`}>
      {groups.map(group => (
        <li
          key={group.rank}
          data-testid="race-podium-rank"
          className={
            group.rank === 1
              ? 'race-podium__rank race-podium__rank--first'
              : 'race-podium__rank'
          }
        >
          <div className="race-podium__label">
            <span className="race-podium__ordinal">{ordinal(group.rank)}</span>
            {group.clubs.length > 1 && (
              <span className="race-podium__tie">
                {group.clubs.length} clubs
              </span>
            )}
          </div>
          <p className="race-podium__when">
            {reachWindowCopy(group.reachedOn, group.observedAfter)}
          </p>
          <ul className="race-podium__clubs">
            {group.clubs.map(club => (
              <li key={club.clubId} className="race-podium__club">
                <Link
                  to={`/district/${club.districtId}/club/${club.clubId}`}
                  className="race-podium__club-link"
                  data-testid="race-podium-club"
                >
                  {club.clubName}
                </Link>
                <Link
                  to={`/district/${club.districtId}`}
                  className="race-podium__district"
                  aria-label={`District ${club.districtId}`}
                >
                  D{club.districtId}
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

export default RacePodium
