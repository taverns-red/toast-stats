import React from 'react'
import { Link } from 'react-router-dom'
import type {
  ClubRaceTier,
  GlobalClubRace,
  GlobalClubRaceReached,
} from '@taverns-red/shared-contracts'
import { CLUB_RACE_TIERS } from '@taverns-red/shared-contracts'
import {
  cohortPercentile,
  membershipBandLabel,
} from '../../utils/cohortPercentile'
import { raceTierTitle, raceTierUrl } from '../../utils/raceTierRoute'
import { reachWindowCopy } from '../../utils/reachWindowCopy'
import { ordinal } from './RacePodium'
import { formatDisplayDate } from '../../utils/dateFormatting'

/* #1556 — the club page's "Worldwide standing" card (spec §4.2, §6).
   Every club gets a private, cohort-based percentile ("top X %"). A RANK is
   shown only for a club that has reached a tier — its highest tier, the
   crossing window, and a deep link into that tier's race with the row
   highlighted. A club that has not reached is never numbered, and the card
   is simply absent when the race artifact is not available. */

export interface WorldwideStandingCardProps {
  race: GlobalClubRace | null
  clubId: string
  goalsMet: number
  members: number
  /** The club's reached row from the artifact, or null when it has not reached. */
  reached: GlobalClubRaceReached | null
}

function highestReached(reached: GlobalClubRaceReached): {
  tier: ClubRaceTier
  rank: number
  reachedOn: string
  after: string | null
} | null {
  for (let i = CLUB_RACE_TIERS.length - 1; i >= 0; i -= 1) {
    const tier = CLUB_RACE_TIERS[i]!
    const standing = reached.tiers[tier]
    if (standing) {
      return {
        tier,
        rank: standing.rank,
        reachedOn: standing.reachedOn,
        after: standing.observedAfter,
      }
    }
  }
  return null
}

/** "Top X%" at or above the median; below it "Ahead of N%" (#2655: the
 *  weakest clubs read "Top 100%"). N is the share of the cohort below. */
function standing(topPercent: number, capital: boolean): string {
  if (topPercent > 50) {
    return `${capital ? 'Ahead' : 'ahead'} of ${100 - topPercent}%`
  }
  return `${capital ? 'Top' : 'top'} ${topPercent}%`
}

/** A club at the very bottom is not "ahead of 0%": it is level with the clubs
 *  that have the same goals (#2655). */
function tiedGoals(goalsMet: number): string {
  const n = Math.max(0, Math.trunc(goalsMet))
  if (n === 0) return 'No goals met yet'
  return `${n} ${n === 1 ? 'goal' : 'goals'} met`
}

export const WorldwideStandingCard: React.FC<WorldwideStandingCardProps> = ({
  race,
  clubId,
  goalsMet,
  members,
  reached,
}) => {
  if (!race) return null

  const cohort = cohortPercentile(race.distribution, goalsMet, members)
  const top = reached ? highestReached(reached) : null

  return (
    <section
      className="club-panel worldwide-standing"
      aria-labelledby="worldwide-standing-title"
      data-testid="worldwide-standing"
    >
      <div className="club-panel__head">
        <h2 id="worldwide-standing-title">Worldwide standing</h2>
      </div>
      <div className="club-panel__body">
        {top && (
          <p className="worldwide-standing__reached">
            <strong>
              {ordinal(top.rank)} club in the world to reach{' '}
              {raceTierTitle(top.tier)}
            </strong>{' '}
            ({reachWindowCopy(top.reachedOn, top.after)}).{' '}
            <Link to={`${raceTierUrl(top.tier)}?highlight=${clubId}`}>
              See the {raceTierTitle(top.tier)} race
            </Link>
          </p>
        )}
        <p className="worldwide-standing__cohort">
          {cohort.topPercentOverall === null
            ? 'No worldwide comparison is available for this date.'
            : cohort.topPercentOverall === 100 &&
                cohort.samePercentOverall !== null
              ? `${tiedGoals(goalsMet)}, like ${cohort.samePercentOverall}% of clubs worldwide`
              : `${standing(cohort.topPercentOverall, true)} of clubs worldwide by goals met`}
          {cohort.topPercentInBand !== null && (
            <>
              {' · '}
              {cohort.topPercentInBand === 100 &&
              cohort.samePercentInBand !== null
                ? `like ${cohort.samePercentInBand}%`
                : standing(cohort.topPercentInBand, false)}{' '}
              among clubs with {membershipBandLabel(cohort.band)}
            </>
          )}
        </p>
        <p className="worldwide-standing__note">
          Compared against {race.scope.clubsScanned.toLocaleString()} clubs on{' '}
          {formatDisplayDate(race.date)}.{' '}
          <Link to="/clubs">Clubs worldwide</Link>
        </p>
      </div>
    </section>
  )
}

export default WorldwideStandingCard
