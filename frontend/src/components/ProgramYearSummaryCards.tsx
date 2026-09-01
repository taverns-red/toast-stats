import React from 'react'
import { Link } from 'react-router-dom'
import type { ProgramYearSummary } from '../utils/programYearSummary'

export interface ProgramYearSummaryCardsProps {
  /** Completed program years, newest first. */
  summaries: ProgramYearSummary[]
  isLoading: boolean
  isError: boolean
  /**
   * How many cards the page expects to render, so the loading skeleton
   * reserves the grid height the loaded list will occupy. Passed from the page
   * (R3) — a presentational component must not re-derive the program year.
   */
  expectedCount?: number
}

/**
 * Fallback skeleton count when the page gives no expectation.
 *
 * This used to be a hardcoded 3 that the loaded list had long outgrown. Once
 * the epic #1496 backfill took the archive to ten completed program years, the
 * grid went from one skeleton row to three real rows on load and pushed
 * everything below it down ~800px — page CLS at 1280 measured 0.210 against
 * prod's 0.085 (#1500). Reserve one skeleton per card you will actually render
 * (Lessons 79/107/125); the count is a prop, and this is only the floor.
 */
const FALLBACK_SKELETON_COUNT = 3

const formatNumber = (n: number): string => n.toLocaleString('en-US')

const METRICS: Array<{
  label: string
  field: keyof Pick<
    ProgramYearSummary,
    | 'totalDistricts'
    | 'totalPaidClubs'
    | 'totalPayments'
    | 'totalDistinguishedClubs'
  >
}> = [
  { label: 'Districts', field: 'totalDistricts' },
  { label: 'Paid clubs', field: 'totalPaidClubs' },
  { label: 'Payments', field: 'totalPayments' },
  { label: 'Distinguished', field: 'totalDistinguishedClubs' },
]

/**
 * The /history per-year summary cards (#892). Presentational — the owning page
 * fetches via `useProgramYearSummaries` and passes the result down. Renders a
 * height-reserving skeleton while loading, an inline notice on error/empty, and
 * one card per completed program year (newest first) otherwise. Each card links
 * into the landing page filtered to that program year (`/?py=<startYear>`).
 */
export const ProgramYearSummaryCards: React.FC<
  ProgramYearSummaryCardsProps
> = ({ summaries, isLoading, isError, expectedCount }) => {
  if (isLoading) {
    const skeletonCount = Math.max(
      1,
      expectedCount && expectedCount > 0
        ? expectedCount
        : FALLBACK_SKELETON_COUNT
    )
    return (
      <div className="history-year-cards" data-testid="history-year-cards">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div
            key={i}
            className="history-year-card history-year-card--skeleton"
            data-testid="history-year-card-skeleton"
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="history-year-cards__notice" role="status">
        Couldn’t load year-end standings right now. Please try again shortly.
      </div>
    )
  }

  if (summaries.length === 0) {
    return (
      <div className="history-year-cards__notice" role="status">
        No completed program years on file yet.
      </div>
    )
  }

  return (
    <div className="history-year-cards" data-testid="history-year-cards">
      {summaries.map(s => (
        <Link
          key={s.startYear}
          to={`/?py=${s.startYear}`}
          className="history-year-card"
          data-testid="history-year-card"
          aria-label={`View ${s.label} final standings`}
        >
          <div className="history-year-card__head">
            <span className="history-year-card__year">{s.label}</span>
            <span className="history-year-card__frozen">
              Final · frozen Jun 30
            </span>
          </div>

          <dl className="history-year-card__metrics">
            {METRICS.map(({ label, field }) => (
              <div key={field} className="history-year-card__metric">
                <dt className="history-year-card__metric-label">{label}</dt>
                <dd className="history-year-card__metric-value">
                  {formatNumber(s[field])}
                </dd>
              </div>
            ))}
          </dl>

          <div className="history-year-card__top">
            <span className="history-year-card__top-label">Top districts</span>
            <ol className="history-year-card__top-list">
              {s.topDistricts.map(d => (
                <li key={d.districtId} className="history-year-card__top-item">
                  <span className="history-year-card__top-rank">
                    {d.overallRank}
                  </span>
                  <span className="history-year-card__top-name">
                    {d.districtName}
                  </span>
                  <span className="history-year-card__top-region">
                    Region {d.region}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Link>
      ))}
    </div>
  )
}
