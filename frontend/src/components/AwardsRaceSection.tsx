import React from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  CompetitiveAwardRanking,
  CompetitiveAwardStandings,
} from '../services/cdn'

interface AwardsRaceSectionProps {
  /** Competitive award standings; null means no data for this snapshot */
  standings: CompetitiveAwardStandings | null
}

/**
 * Awards Race Section (#331)
 *
 * Displays leaderboards for the three competitive district awards:
 * - President's Extension Award (top 3 net club growth)
 * - President's 20-Plus Award (top 3 % clubs with 20+ paid members)
 * - District Club Retention Award (top 3 retaining ≥90% paid clubs)
 *
 * Collapsed by default — directors expand to see how close they are to
 * winning each award. Top 3 are highlighted with gold/silver/bronze medals.
 */
export const AwardsRaceSection: React.FC<AwardsRaceSectionProps> = ({
  standings,
}) => {
  if (!standings) return null

  const extensionEntries = standings.extensionAward ?? []
  const twentyPlusEntries = standings.twentyPlusAward ?? []
  const retentionEntries = standings.retentionAward ?? []

  // Don't render if all leaderboards are empty
  if (
    extensionEntries.length === 0 &&
    twentyPlusEntries.length === 0 &&
    retentionEntries.length === 0
  ) {
    return null
  }

  return (
    <details className="bg-white rounded-lg shadow-md mt-4">
      <summary className="cursor-pointer select-none text-lg font-bold text-gray-900 p-4 hover:text-tm-loyal-blue transition-colors flex items-center gap-2">
        <span aria-hidden="true">🏆</span>
        Awards Race
        <span className="text-sm font-normal text-gray-500 ml-2">
          Top 3 districts for each competitive award
        </span>
      </summary>
      <div className="px-4 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Leaderboard
            title="President's Extension Award"
            description="Largest net club growth"
            valueLabel="Net Clubs"
            valueFormatter={v => (v >= 0 ? `+${v}` : `${v}`)}
            entries={extensionEntries.slice(0, 10)}
          />
          <Leaderboard
            title="President's 20-Plus Award"
            description="Highest % clubs with 20+ paid members"
            valueLabel="% Clubs"
            valueFormatter={v => `${v.toFixed(1)}%`}
            entries={twentyPlusEntries.slice(0, 10)}
          />
          <Leaderboard
            title="District Club Retention Award"
            description="Top retention (≥90% paid clubs)"
            valueLabel="Retention"
            valueFormatter={v => `${v.toFixed(1)}%`}
            entries={retentionEntries.slice(0, 10)}
          />
        </div>
      </div>
    </details>
  )
}

interface LeaderboardProps {
  title: string
  description: string
  valueLabel: string
  valueFormatter: (value: number) => string
  entries: CompetitiveAwardRanking[]
}

const Leaderboard: React.FC<LeaderboardProps> = ({
  title,
  description,
  valueLabel,
  valueFormatter,
  entries,
}) => {
  const navigate = useNavigate()

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 font-tm-headline">
          {title}
        </h3>
        <p className="text-xs text-gray-500 font-tm-body">{description}</p>
      </div>
      <table className="w-full">
        <thead className="bg-white">
          <tr>
            <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
              Rank
            </th>
            <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">
              District
            </th>
            <th className="px-2 py-1 text-right text-xs font-medium text-gray-500 uppercase">
              {valueLabel}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map(entry => (
            <tr
              key={entry.districtId}
              onClick={() => navigate(`/district/${entry.districtId}`)}
              className={`cursor-pointer hover:bg-tm-loyal-blue-10 transition-colors ${
                entry.isWinner ? 'bg-yellow-50' : ''
              }`}
            >
              <td className="px-2 py-1.5 whitespace-nowrap">
                <MedalBadge rank={entry.rank} isWinner={entry.isWinner} />
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-sm text-gray-900 font-medium">
                {entry.districtName}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-sm text-right text-gray-900 tabular-nums">
                {valueFormatter(entry.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Medal badge for top 3 winners. Gold/Silver/Bronze.
 */
const MedalBadge: React.FC<{ rank: number; isWinner: boolean }> = ({
  rank,
  isWinner,
}) => {
  if (isWinner && rank === 1) {
    return (
      <span
        aria-label="Award winner — gold medal"
        className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-700"
      >
        <span aria-hidden="true">🥇</span>1
      </span>
    )
  }
  if (isWinner && rank === 2) {
    return (
      <span
        aria-label="Award winner — silver medal"
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600"
      >
        <span aria-hidden="true">🥈</span>2
      </span>
    )
  }
  if (isWinner && rank === 3) {
    return (
      <span
        aria-label="Award winner — bronze medal"
        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"
      >
        <span aria-hidden="true">🥉</span>3
      </span>
    )
  }
  return <span className="text-xs text-gray-500 tabular-nums">#{rank}</span>
}
