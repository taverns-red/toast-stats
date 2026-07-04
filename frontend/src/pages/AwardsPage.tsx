import React from 'react'
import { Link } from 'react-router-dom'
import { useCompetitiveAwards } from '../hooks/useCompetitiveAwards'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useLatestAsOfDate } from '../hooks/useLatestAsOfDate'
import { DataControlsBar } from '../components/DataControlsBar'
import type {
  CompetitiveAwardRanking,
  CompetitiveAwardStandings,
} from '../services/cdn'

/* /awards page (#371-#373). Full top-10 leaderboards per district award
   — the deeper view that the Districts page's Awards Race summary
   defers to. Uses the existing useCompetitiveAwards hook for data. */

interface AwardSpec {
  key: keyof Pick<
    CompetitiveAwardStandings,
    'extensionAward' | 'twentyPlusAward' | 'retentionAward'
  >
  title: string
  description: string
  formatValue: (v: number) => string
  methodologyAnchor: string
}

const AWARDS: ReadonlyArray<AwardSpec> = [
  {
    key: 'extensionAward',
    title: "President's Extension Award",
    description:
      'Largest net club growth — chartering and reviving clubs above the program-year baseline.',
    formatValue: v => (v >= 0 ? `+${v}` : `${v}`),
    methodologyAnchor: '#caveats',
  },
  {
    key: 'twentyPlusAward',
    title: "President's 20-Plus Award",
    description:
      'Highest percentage of clubs achieving 20+ paid members — depth, not just count.',
    formatValue: v => `${v.toFixed(1)}%`,
    methodologyAnchor: '#dcp-tiers',
  },
  {
    key: 'retentionAward',
    title: 'District Club Retention Award',
    description:
      'Top retention of base clubs (≥90% of last year’s paid clubs survived).',
    formatValue: v => `${v.toFixed(1)}%`,
    methodologyAnchor: '#caveats',
  },
]

const AwardsPage: React.FC = () => {
  // PY selector state (#1301) — the page owns program year/date (R3) and
  // fetches the awards snapshot for the SELECTED program year, so switching
  // the year re-queries (was hardcoded "latest").
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    cachedDates,
    effectiveDate,
    isLatestSnapshot,
    isDatesPending,
  } = useProgramYearControls()

  const { data: standings, isLoading } = useCompetitiveAwards(effectiveDate)

  // Awards standings carry no `sourceCsvDate`, so source the as-of date from the
  // shared global freshness signal so the pill matches every other page (#1310).
  // Gated on isLatestSnapshot: the global as-of date only describes the latest
  // snapshot, never a finalized historical date selected via the picker.
  const { asOfDate: globalAsOfDate } = useLatestAsOfDate()

  return (
    <div className="awards-page">
      {/* Adopt the shared page-header layout (Districts/Regions/Region) so the
          DataControlsBar toolbar lays out top-right on desktop and stacks on
          mobile — awards-page__header keeps its own bottom-margin. The as-of
          date + month-end reconciliation state come from the shared global
          freshness source (#1310), matching every other page's pill. */}
      <header className="districts-page-header awards-page__header">
        <div className="districts-page-header__intro">
          <p className="placeholder-page__eyebrow">
            Awards · {standings?.metadata?.totalDistricts ?? 117} districts
          </p>
          <h1 className="placeholder-page__title">District Awards</h1>
          <p className="placeholder-page__body">
            Competitive district-level awards from Toastmasters International.
            Rankings are computed from the same public data as the District
            leaderboard — see the{' '}
            <Link
              to="/methodology#borda-count"
              className="districts-methodology-callout__link"
            >
              Methodology
            </Link>{' '}
            page for the full Borda definition and per-award threshold notes.
          </p>
        </div>
        <div className="districts-page-header__actions">
          <DataControlsBar
            latestSnapshotDate={effectiveDate}
            asOfDate={isLatestSnapshot ? globalAsOfDate : undefined}
            isLatest={isLatestSnapshot}
            availableProgramYears={availableProgramYears}
            selectedProgramYear={selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={cachedDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            freshnessPending={isDatesPending}
          />
        </div>
      </header>

      {isLoading && (
        <p className="awards-page__empty">Loading award standings…</p>
      )}

      {!isLoading && !standings && (
        <p className="awards-page__empty">
          No award standings available for the current snapshot.
        </p>
      )}

      {standings && (
        <div className="awards-page__grid">
          {AWARDS.map(spec => (
            <AwardLeaderboard
              key={spec.title}
              spec={spec}
              entries={(standings[spec.key] ?? []).slice(0, 10)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default AwardsPage

interface AwardLeaderboardProps {
  spec: AwardSpec
  entries: CompetitiveAwardRanking[]
}

const AwardLeaderboard: React.FC<AwardLeaderboardProps> = ({
  spec,
  entries,
}) => {
  const winnerCount = entries.filter(e => e.isWinner).length

  return (
    <section
      className="awards-page-card"
      aria-labelledby={`award-${spec.key}-title`}
    >
      <header className="awards-page-card__header">
        <h2 id={`award-${spec.key}-title`} className="awards-page-card__title">
          {spec.title}
        </h2>
        <p className="awards-page-card__description">{spec.description}</p>
        <div className="awards-page-card__meta">
          {winnerCount > 0 && (
            <span className="awards-page-card__achieved">
              ✓ {winnerCount} achieved
            </span>
          )}
          <Link
            to={`/methodology${spec.methodologyAnchor}`}
            className="awards-page-card__methodology-link"
          >
            Methodology
          </Link>
        </div>
      </header>
      {entries.length === 0 ? (
        <p className="awards-page-card__empty">No standings yet.</p>
      ) : (
        <ol className="awards-page-card__list">
          {entries.map(entry => (
            <li key={entry.districtId} className="awards-page-card__row">
              <span className="awards-page-card__rank">#{entry.rank}</span>
              <Link
                to={`/district/${entry.districtId}`}
                className="awards-page-card__district"
              >
                {entry.districtName}
              </Link>
              <span className="awards-page-card__region">R{entry.region}</span>
              <span className="awards-page-card__value">
                {spec.formatValue(entry.value)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
