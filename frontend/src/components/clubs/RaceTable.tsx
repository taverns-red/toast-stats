import React from 'react'
import { Link } from 'react-router-dom'
import type {
  ClubRaceOfficialCode,
  ClubRaceTier,
  GlobalClubRaceReached,
} from '@taverns-red/shared-contracts'
import { RosetteIcon } from '../recognition/recognitionRegistry'
import { raceTierTitle } from '../../utils/raceTierRoute'
import { reachWindowCopy } from '../../utils/reachWindowCopy'

/* #1556 — the full "first to reach" table for one tier. Every row is a club
   that HAS reached (the artifact carries no other club), so the table has no
   bottom. Columns: Rank · Club · District · Reached (window copy) · Goals
   (10-dot strip from the INDEPENDENT boolean array — never goals 1–N) ·
   Members (+ net growth) · Official (TI's rosette, only when the code exists).

   Today's numbers live under `current`; a club absent from today's snapshot
   keeps its crossing and shows "—" for today, with no "lost" label (spec §6).
   Below 640px the CSS turns rows into stacked cards; the table scrolls inside
   its own container, never the body. */

export interface RaceTableProps {
  tier: ClubRaceTier
  rows: readonly GlobalClubRaceReached[]
  /** `?highlight=<clubId>` — the row gets aria-current and an outline. */
  highlightClubId?: string | undefined
}

const CODE_TO_TIER: Record<ClubRaceOfficialCode, ClubRaceTier> = {
  D: 'Distinguished',
  S: 'Select',
  P: 'President',
  M: 'Smedley',
}

const LEVEL_ORDER = {
  NotDistinguished: 0,
  Distinguished: 1,
  Select: 2,
  President: 3,
  Smedley: 4,
} as const

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

const GoalStrip: React.FC<{
  clubId: string
  goalsMet: number
  achieved: readonly boolean[] | null
}> = ({ clubId, goalsMet, achieved }) => (
  <span
    className="race-goal-strip"
    role="img"
    aria-label={`${goalsMet} of 10 goals met`}
    data-testid={`race-goal-strip-${clubId}`}
  >
    {achieved
      ? achieved.map((met, index) => (
          <span
            key={index}
            className={
              met ? 'race-goal-dot race-goal-dot--met' : 'race-goal-dot'
            }
            data-testid="race-goal-dot"
            data-met={String(met)}
          />
        ))
      : null}
    <span className="race-goal-strip__count" aria-hidden="true">
      {goalsMet}
    </span>
  </span>
)

export const RaceTable: React.FC<RaceTableProps> = ({
  tier,
  rows,
  highlightClubId,
}) => {
  const title = raceTierTitle(tier)
  const ranked = rows
    .filter(row => row.tiers[tier])
    .sort(
      (a, b) =>
        a.tiers[tier]!.rank - b.tiers[tier]!.rank ||
        a.clubName.localeCompare(b.clubName)
    )

  return (
    <div className="race-table__scroll">
      <table className="race-table">
        <caption className="race-table__caption">
          First to {title} — every club that has reached it this program year
        </caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Club</th>
            <th scope="col">District</th>
            <th scope="col">Reached</th>
            <th scope="col">Goals</th>
            <th scope="col">Members</th>
            <th scope="col">Official</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(row => {
            const standing = row.tiers[tier]!
            const current = row.current
            const highlighted = highlightClubId === row.clubId
            const unconfirmed =
              current !== null &&
              LEVEL_ORDER[current.activeMembersLevel] >
                LEVEL_ORDER[current.level]
            return (
              <tr
                key={row.clubId}
                id={`race-row-${row.clubId}`}
                className={
                  highlighted
                    ? 'race-table__row race-table__row--highlight'
                    : 'race-table__row'
                }
                aria-current={highlighted ? 'true' : undefined}
              >
                <td className="race-table__rank" data-label="Rank">
                  {standing.rank}
                </td>
                <td className="race-table__club" data-label="Club">
                  <Link to={`/district/${row.districtId}/club/${row.clubId}`}>
                    {row.clubName}
                  </Link>
                </td>
                <td data-label="District">
                  <Link to={`/district/${row.districtId}`}>
                    D{row.districtId}
                  </Link>
                </td>
                <td data-label="Reached">
                  {reachWindowCopy(standing.reachedOn, standing.observedAfter)}
                </td>
                <td data-label="Goals">
                  {current ? (
                    <GoalStrip
                      clubId={row.clubId}
                      goalsMet={current.goalsMet}
                      achieved={current.dcpGoalsAchieved}
                    />
                  ) : (
                    <span aria-label="Not in today's snapshot">—</span>
                  )}
                </td>
                <td data-label="Members">
                  {current ? (
                    <>
                      <span className="race-table__members">
                        {current.members}
                      </span>{' '}
                      <span className="race-table__growth">
                        {signed(current.netGrowth)}
                      </span>
                      {unconfirmed && (
                        <span
                          className="race-table__unconfirmed"
                          title="Qualifies on active members; not yet on confirmed April renewals"
                        >
                          unconfirmed
                        </span>
                      )}
                    </>
                  ) : (
                    <span aria-label="Not in today's snapshot">—</span>
                  )}
                </td>
                <td data-label="Official">
                  {row.official ? (
                    <span
                      className="race-official"
                      data-testid={`race-official-${row.clubId}`}
                      title={`Recognised by Toastmasters International ${reachWindowCopy(
                        row.official.since,
                        row.official.observedAfter
                      )}`}
                    >
                      <RosetteIcon className="race-official__icon" />
                      {raceTierTitle(CODE_TO_TIER[row.official.code])}
                    </span>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default RaceTable
