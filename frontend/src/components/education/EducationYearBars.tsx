import React from 'react'
import type { EducationTrendYear } from '../../utils/educationTrend'
import { ChartSparklineExpand } from '../ChartSparklineExpand'

/* Multi-year education bars (#1807; first built for the region page,
   #1810). One row per program year: the total printed, the split stacked
   in the bar (Pathways, Legacy, DTM, Other — the all-awards bar's colours)
   and printed as text. A year without a ledger is a row that says "Not
   available" with no bar, never a zero-length bar. The selected program
   year comes from the page (R3). Bars are aria-hidden decoration. */

export interface EducationYearBarsProps {
  years: EducationTrendYear[]
  /** The page's selected PY label (R3), e.g. `2026-2027`. */
  programYear: string
  /** One secondary line under the rows: what each year sums. */
  note: React.ReactNode
  /** Below 768, collapse the rows to sparkline-expand (#1793, #1835):
   *  the headline and a sparkline behind a tap, the rows in the sheet;
   *  `urlId` deep-links the open sheet via `?chartExpanded=`. Omitted =
   *  the rows show inline at every width. */
  sparkline?: {
    urlId: string
    headline: React.ReactNode
    series: number[]
  }
}

const fmt = (n: number) => n.toLocaleString()
const shortPy = (py: string) => `${py.slice(0, 4)}-${py.slice(7)}`

const SEGMENTS = [
  { key: 'pathways', label: 'Pathways' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'dtm', label: 'DTM' },
  { key: 'other', label: 'Other' },
] as const

export const EducationYearBars: React.FC<EducationYearBarsProps> = ({
  years,
  programYear,
  note,
  sparkline,
}) => {
  const max = Math.max(1, ...years.map(y => y.totals?.awards ?? 0))
  const rows = (
    <ul className="education-rows" aria-label="Awards by program year">
      {years.map(({ programYear: py, totals: t }) => {
        const current = py === programYear
        return (
          <li
            key={py}
            className={`education-row--path education-year${current ? ' is-current' : ''}${t ? '' : ' is-unavailable'}`}
            aria-current={current ? 'true' : undefined}
          >
            <span className="education-row__label">{shortPy(py)}</span>
            {t ? (
              <>
                <span className="education-row__value">{fmt(t.awards)}</span>
                <span
                  className="education-year__track"
                  aria-hidden="true"
                  style={{ width: `${(t.awards / max) * 100}%` }}
                >
                  {SEGMENTS.map(s =>
                    t[s.key] > 0 ? (
                      <span
                        key={s.key}
                        className={`education-stack__seg education-seg--${s.key}`}
                        style={{ flexGrow: t[s.key] }}
                      />
                    ) : null
                  )}
                </span>
                <span className="education-year__split">
                  {SEGMENTS.filter(
                    s =>
                      s.key === 'pathways' || s.key === 'legacy' || t[s.key] > 0
                  )
                    .map(s => `${s.label} ${fmt(t[s.key])}`)
                    .join(' · ')}
                </span>
              </>
            ) : (
              <span className="education-row__value education-year__na">
                Not available
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
  return (
    <section className="education-section" aria-labelledby="edu-years-h">
      <h2 id="edu-years-h" className="education-section__title">
        By program year
      </h2>
      {sparkline ? (
        <ChartSparklineExpand
          urlId={sparkline.urlId}
          title="Awards by program year"
          headline={sparkline.headline}
          sparklineData={sparkline.series}
        >
          {rows}
        </ChartSparklineExpand>
      ) : (
        rows
      )}
      <p className="education-note">{note}</p>
    </section>
  )
}

export default EducationYearBars
