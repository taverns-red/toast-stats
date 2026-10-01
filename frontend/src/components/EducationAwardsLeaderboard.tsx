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
}

interface CardSpec {
  title: string
  subtitle: string
  countLabel: string
  unavailableMessage: string
}

const AWARDS_CARD: CardSpec = {
  title: 'Education awards per base member',
  subtitle:
    "Pathways levels 1–5 + DTM earned this program year ÷ club's membership base.",
  countLabel: 'Awards / base',
  unavailableMessage: 'No education report available for this date.',
}

const MEMBERS_CARD: CardSpec = {
  title: 'Members with an education award',
  subtitle:
    "Distinct members who earned at least one award ÷ club's membership base.",
  countLabel: 'Members / base',
  unavailableMessage:
    "Not available for this date — Toastmasters' archive for past years doesn't include member-level data.",
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
}

const LeaderboardCard: React.FC<CardProps> = ({
  spec,
  ranking,
  districtId,
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
      <p className="text-xs text-gray-600 theme-dark:text-gray-400 font-tm-body mb-3">
        {spec.subtitle}
      </p>

      {!ranking.available ? (
        <p className="text-sm text-gray-600 theme-dark:text-gray-400 font-tm-body">
          {spec.unavailableMessage}
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
> = ({ rankings, districtId }) => (
  <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
    <LeaderboardCard
      spec={AWARDS_CARD}
      ranking={rankings.awardsPerBase}
      districtId={districtId}
    />
    <LeaderboardCard
      spec={MEMBERS_CARD}
      ranking={rankings.membersWithAward}
      districtId={districtId}
    />
  </div>
)

export default EducationAwardsLeaderboard
