import React, { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MIN_ELIGIBLE_BASE,
  type EducationAwardEntry,
  type EducationAwardRanking,
} from '../utils/educationAwardRankings'

/* EducationAwardsLeaderboard (#1592) — two per-club ratio rankings on the
   district Analytics page, both normalised by the club's July 1 membership
   base: education awards per base member, and members with an award per base
   member. Pure presentation: rankings arrive pre-computed from
   computeEducationAwardRankings (ties already share a rank; clubs under the
   eligibility base are split out). Top 10 by default; a disclosure button
   reveals the full ranked list plus the not-eligible group. */

const TOP_N = 10

export interface EducationAwardsLeaderboardProps {
  rankings: {
    awardsPerBase: EducationAwardRanking
    membersWithAward: EducationAwardRanking
  }
  districtId: string
  /** The viewed program year is older than the district's newest one with
   *  data — decided by the page from its own PY selection (R3). Selects which
   *  "unavailable" explanation applies. */
  isPriorProgramYear: boolean
}

interface CardSpec {
  title: string
  subtitle: string
  note?: string
  countLabel: string
  unavailableMessage: { current: string; prior: string }
}

const AWARDS_CARD: CardSpec = {
  title: 'Education awards per base member',
  subtitle:
    "Pathways levels 1–5 + DTM earned this program year ÷ club's membership base.",
  note: "Counts every award listed in Toastmasters' education report (not DCP credit), so totals can differ from the education levels card.",
  countLabel: 'Awards / base',
  unavailableMessage: {
    current: 'No education report available for this date.',
    // Prior-PY reports are written only for the June 30 year-end snapshot.
    prior:
      'For past program years, this leaderboard is shown on the June 30 year-end snapshot.',
  },
}

const MEMBERS_CARD: CardSpec = {
  title: 'Members with an education award',
  subtitle:
    "Distinct members who earned at least one award ÷ club's membership base.",
  countLabel: 'Members / base',
  unavailableMessage: {
    // Current-PY snapshots predating the member counts lack the section too.
    current:
      "Member counts aren't available for this date yet — they start with newer snapshots.",
    prior:
      "Not available for this date — Toastmasters' archive for past years doesn't include member-level data.",
  },
}

const SOURCE_LABELS: Record<string, string> = {
  'education-archive': 'TI Educational Achievement Archive',
}
const DEFAULT_SOURCE_LABEL = 'TI Education Achievements report'

const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`

const provenance = (ranking: EducationAwardRanking): string | null => {
  if (!ranking.sourceReportType) return null
  const label = SOURCE_LABELS[ranking.sourceReportType] ?? DEFAULT_SOURCE_LABEL
  return `Source: ${label}${ranking.asOf ? `, as of ${ranking.asOf}` : ''}`
}

const thClass =
  'px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-600 theme-dark:text-gray-400'
const tdClass = 'px-2 py-2 align-top'

interface ClubTableProps {
  caption: string
  captionVisible: boolean
  entries: EducationAwardEntry[]
  tiedRanks: Set<number>
  showRank: boolean
  countLabel: string
  districtId: string
}

const ClubTable: React.FC<ClubTableProps> = ({
  caption,
  captionVisible,
  entries,
  tiedRanks,
  showRank,
  countLabel,
  districtId,
}) => (
  <table className="w-full table-fixed text-sm font-tm-body">
    <caption
      className={
        captionVisible
          ? 'pt-3 pb-1 text-left text-xs font-semibold text-gray-700 theme-dark:text-gray-300'
          : 'sr-only'
      }
    >
      {caption}
    </caption>
    <thead className="border-b border-gray-200 theme-dark:border-gray-700">
      <tr>
        {showRank && (
          <th scope="col" className={`${thClass} w-12 text-left`}>
            Rank
          </th>
        )}
        <th scope="col" className={`${thClass} text-left`}>
          Club
        </th>
        <th scope="col" className={`${thClass} w-[5.5rem] text-right`}>
          {countLabel}
        </th>
        <th scope="col" className={`${thClass} w-[4.5rem] text-right`}>
          Rate
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100 theme-dark:divide-gray-800">
      {entries.map(e => (
        <tr key={e.clubId}>
          {showRank && (
            <td
              className={`${tdClass} tabular-nums text-xs font-bold text-tm-true-maroon`}
            >
              {e.rank !== null && tiedRanks.has(e.rank) && (
                <span aria-hidden="true">=</span>
              )}
              {e.rank}
              {e.rank !== null && tiedRanks.has(e.rank) && (
                <span className="sr-only"> (tied)</span>
              )}
            </td>
          )}
          <td className={`${tdClass} break-words`}>
            <Link
              to={`/district/${districtId}/club/${e.clubId}`}
              className="text-tm-loyal-blue hover:underline"
            >
              {e.clubName}
            </Link>
            <span className="block text-[11px] text-gray-600 theme-dark:text-gray-400">
              Div {e.divisionId} · Area {e.areaId}
            </span>
          </td>
          <td
            className={`${tdClass} text-right tabular-nums text-xs text-gray-700 theme-dark:text-gray-300`}
          >
            {e.numerator} / {e.denominator}
          </td>
          <td
            className={`${tdClass} text-right tabular-nums text-xs font-semibold text-gray-900 theme-dark:text-gray-100`}
          >
            {formatPercent(e.ratio)}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

const tiedRanksOf = (entries: EducationAwardEntry[]): Set<number> => {
  const seen = new Set<number>()
  const tied = new Set<number>()
  for (const e of entries) {
    if (e.rank === null) continue
    if (seen.has(e.rank)) tied.add(e.rank)
    seen.add(e.rank)
  }
  return tied
}

interface CardProps {
  spec: CardSpec
  ranking: EducationAwardRanking
  districtId: string
  isPriorProgramYear: boolean
}

const LeaderboardCard: React.FC<CardProps> = ({
  spec,
  ranking,
  districtId,
  isPriorProgramYear,
}) => {
  const [expanded, setExpanded] = useState(false)
  const baseId = useId()
  const titleId = `${baseId}-title`
  const listId = `${baseId}-list`

  const { ranked, ineligible } = ranking
  const total = ranked.length + ineligible.length
  const hasMore = ranked.length > TOP_N || ineligible.length > 0
  const visibleRanked = expanded ? ranked : ranked.slice(0, TOP_N)
  const source = provenance(ranking)

  return (
    <section aria-labelledby={titleId} className="redesign-panel">
      <h3 id={titleId} className="redesign-panel__header !mb-1">
        {spec.title}
      </h3>
      <p
        className={`text-xs text-gray-600 theme-dark:text-gray-400 font-tm-body ${spec.note ? 'mb-1' : 'mb-3'}`}
      >
        {spec.subtitle}
      </p>
      {spec.note && (
        <p className="text-[11px] text-gray-600 theme-dark:text-gray-400 font-tm-body mb-3">
          {spec.note}
        </p>
      )}

      {!ranking.available ? (
        <p className="text-sm text-gray-600 theme-dark:text-gray-400 font-tm-body">
          {isPriorProgramYear
            ? spec.unavailableMessage.prior
            : spec.unavailableMessage.current}
        </p>
      ) : (
        <>
          <div id={listId}>
            {ranked.length === 0 ? (
              <p className="text-sm text-gray-600 theme-dark:text-gray-400 font-tm-body">
                No clubs have a membership base of {MIN_ELIGIBLE_BASE} or more
                yet.
              </p>
            ) : (
              <ClubTable
                caption={
                  expanded
                    ? 'Ranked clubs'
                    : `Ranked clubs (top ${Math.min(TOP_N, ranked.length)})`
                }
                captionVisible={false}
                entries={visibleRanked}
                tiedRanks={tiedRanksOf(ranked)}
                showRank
                countLabel={spec.countLabel}
                districtId={districtId}
              />
            )}
            {expanded && ineligible.length > 0 && (
              <ClubTable
                caption={`Not eligible (base under ${MIN_ELIGIBLE_BASE})`}
                captionVisible
                entries={ineligible}
                tiedRanks={new Set()}
                showRank={false}
                countLabel={spec.countLabel}
                districtId={districtId}
              />
            )}
          </div>
          {hasMore && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded(v => !v)}
              className="mt-3 min-h-[44px] px-3 text-sm font-semibold text-tm-loyal-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded font-tm-body"
            >
              {expanded
                ? 'Show fewer'
                : `Show all ${total} ${total === 1 ? 'club' : 'clubs'}`}
            </button>
          )}
        </>
      )}

      {ranking.available && source && (
        <p className="mt-2 text-[11px] text-gray-600 theme-dark:text-gray-400 font-tm-body">
          {source}
        </p>
      )}
    </section>
  )
}

export const EducationAwardsLeaderboard: React.FC<
  EducationAwardsLeaderboardProps
> = ({ rankings, districtId, isPriorProgramYear }) => (
  <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
    <LeaderboardCard
      spec={AWARDS_CARD}
      ranking={rankings.awardsPerBase}
      districtId={districtId}
      isPriorProgramYear={isPriorProgramYear}
    />
    <LeaderboardCard
      spec={MEMBERS_CARD}
      ranking={rankings.membersWithAward}
      districtId={districtId}
      isPriorProgramYear={isPriorProgramYear}
    />
  </div>
)

export default EducationAwardsLeaderboard
