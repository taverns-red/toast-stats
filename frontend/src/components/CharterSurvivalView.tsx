import React, { useMemo } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import {
  shortProgramYear,
  type CharterCohort,
  type CharterCohortSurvival,
  type CharterCohortSurvivalScope,
  type PooledYearCell,
} from '../utils/charterCohortSurvival'
import {
  ChartReadout,
  useChartReadout,
  type ChartReading,
} from './charts/ChartReadout'

/* Charter cohort survival (#1817, epic #1781) — `/district/:id/growth/survival`,
   and at region and world scope (#1818) `/region/:n/growth/survival` and
   `/regions/growth/survival`: the same component, the copy and the
   moved-away column fitted to the scope.

   - Headline: pooled survival after 1, 3 and 5 years, as text with counts.
   - Chart: one faint line per cohort for context, the pooled line in ink and
     at most one highlighted cohort in the product accent. The highlighted
     cohort is URL state (`?cohort=<charter PY>`) chosen by links — same route,
     no tabs — so a deep link or the back button restores it.
   - Table: the accessible alternative and the precise values. Unreached
     years read "not reached", never 0%; the in-progress PY reads "so far".
   Values are text in ink; colour only marks identity, with a legend. */

const COHORT_PARAM = 'cohort'

/** The curves of a district, a region or the world. */
export type SurvivalCurves = Omit<CharterCohortSurvival, 'districtId'>

/** Whose cohorts these are: the district page's, a region's or the world's. */
export type SurvivalScope = { kind: 'district' } | CharterCohortSurvivalScope

interface ScopeCopy {
  /** "here", "in Region 09", "worldwide". */
  where: string
  /** Who counts as active although they left the scope. */
  movedNote: string
  /** The moved-away column header; null = no column (the world). */
  movedHeader: string | null
  /** How the cohort is drawn, for the censoring note. */
  cohortDefinition: string
  /** The empty state's pointer elsewhere. */
  elsewhere: string
}

function scopeCopy(scope: SurvivalScope): ScopeCopy {
  if (scope.kind === 'region') {
    const name = `Region ${scope.regionId}`
    return {
      where: `in ${name}`,
      movedNote:
        'Clubs now in another region, after a move or a redrawing of the regions, count as active.',
      movedHeader: 'In another region',
      cohortDefinition: `A cohort is the clubs first seen in a program year, in ${name} that year (each year's own region membership)`,
      elsewhere: 'or look at another region',
    }
  }
  if (scope.kind === 'world') {
    return {
      where: 'worldwide',
      movedNote: 'A club counts as active wherever it moved.',
      movedHeader: null,
      cohortDefinition: 'A cohort is the clubs first seen in a program year',
      elsewhere: '',
    }
  }
  return {
    where: 'here',
    movedNote: 'Clubs that moved to another district count as active.',
    movedHeader: 'Moved away',
    cohortDefinition:
      'A cohort is the clubs first seen in a program year, in this district that year',
    elsewhere: 'or look at a district that chartered clubs',
  }
}
const HEADLINE_YEARS = [1, 3, 5] as const

const pct = (share: number): string => `${Math.round(share * 100)}%`
const seriesKey = (py: string) => `c${py.replace('-', '_')}`

const yearLabel = (k: number) => (k === 1 ? '1 year' : `${k} years`)

interface ChartRow {
  year: number
  pooled: number | null
  [cohort: string]: number | null
}

function buildRows(s: SurvivalCurves, cohorts: CharterCohort[]) {
  const rows: ChartRow[] = []
  for (let k = 0; k <= s.maxYears; k++) {
    const pooledCell = k === 0 ? null : (s.pooled[k - 1] ?? null)
    const row: ChartRow = {
      year: k,
      pooled: k === 0 ? 100 : pooledCell ? pooledCell.share * 100 : null,
    }
    for (const c of cohorts) {
      const cell = k === 0 ? null : (c.years[k - 1] ?? null)
      row[seriesKey(c.programYear)] =
        k === 0 ? 100 : cell ? cell.share * 100 : null
    }
    rows.push(row)
  }
  return rows
}

/* ── Headline ─────────────────────────────────────────────────────────── */

const Headline: React.FC<{ pooled: (PooledYearCell | null)[] }> = ({
  pooled,
}) => (
  <ul className="survival-kpis" aria-label="Survival after 1, 3 and 5 years">
    {HEADLINE_YEARS.map(k => {
      const cell = pooled[k - 1] ?? null
      return (
        <li key={k} className="survival-kpi">
          <span className="survival-kpi__label">After {yearLabel(k)}</span>
          {cell ? (
            <>
              <span className="survival-kpi__value">{pct(cell.share)}</span>
              <span className="survival-kpi__hint">
                {cell.survivors} of {cell.chartered} clubs
                {cell.provisional ? ' · so far' : ''}
              </span>
            </>
          ) : (
            <>
              <span className="survival-kpi__value survival-kpi__value--na">
                —
              </span>
              <span className="survival-kpi__hint">Not reached yet</span>
            </>
          )}
        </li>
      )
    })}
  </ul>
)

/* ── Cohort links (URL state, no tabs) ────────────────────────────────── */

const CohortLinks: React.FC<{
  cohorts: CharterCohort[]
  selected: string | null
}> = ({ cohorts, selected }) => {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const href = (py: string | null) => {
    const next = new URLSearchParams(params)
    if (py) next.set(COHORT_PARAM, py)
    else next.delete(COHORT_PARAM)
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }
  const options = [
    { key: 'all', label: 'All cohorts', py: null as string | null },
    ...cohorts.map(c => ({
      key: c.programYear,
      label: shortProgramYear(c.programYear),
      py: c.programYear as string | null,
    })),
  ]
  return (
    <nav aria-label="Highlight a cohort" className="survival-switch">
      {options.map(o => {
        const current = o.py === selected
        return (
          <Link
            key={o.key}
            to={href(o.py)}
            replace
            preventScrollReset
            aria-current={current ? 'true' : undefined}
            className={`survival-switch__link${current ? ' is-current' : ''}`}
          >
            {o.label}
          </Link>
        )
      })}
    </nav>
  )
}

/* ── Chart ────────────────────────────────────────────────────────────── */

function describeYear(
  k: number,
  s: SurvivalCurves,
  highlighted: CharterCohort | null
): ChartReading {
  const rows: ChartReading['rows'] = []
  const pooled = k === 0 ? null : (s.pooled[k - 1] ?? null)
  rows.push({
    key: 'pooled',
    name: 'All cohorts',
    value:
      k === 0
        ? '100%'
        : pooled
          ? `${pct(pooled.share)} (${pooled.survivors} of ${pooled.chartered})`
          : 'not reached',
    color: 'var(--ink)',
  })
  if (highlighted) {
    const cell = k === 0 ? null : (highlighted.years[k - 1] ?? null)
    rows.push({
      key: 'cohort',
      name: shortProgramYear(highlighted.programYear),
      value:
        k === 0
          ? '100%'
          : cell
            ? `${pct(cell.share)} (${cell.survivors} of ${highlighted.chartered})`
            : 'not reached',
      color: 'var(--tm-loyal-blue)',
    })
  }
  return { label: k === 0 ? 'Charter year' : `After ${yearLabel(k)}`, rows }
}

const SurvivalTooltip: React.FC<
  Partial<TooltipContentProps<number, string>> & {
    survival: SurvivalCurves
    highlighted: CharterCohort | null
  }
> = ({ active, label, survival, highlighted }) => {
  if (!active || label === undefined) return null
  const reading = describeYear(Number(label), survival, highlighted)
  return (
    <div className="survival-tooltip">
      <p className="survival-tooltip__label">{reading.label}</p>
      {reading.rows.map(r => (
        <p key={r.key} className="survival-tooltip__row">
          <span
            className="survival-swatch"
            aria-hidden="true"
            style={{ background: r.color }}
          />
          {r.name}: {r.value}
        </p>
      ))}
    </div>
  )
}

function chartDescription(
  s: SurvivalCurves,
  highlighted: CharterCohort | null
): string {
  const parts = [
    `Club survival by years since charter, ${s.cohorts.filter(c => c.chartered > 0).length} cohorts.`,
  ]
  const pooledText = HEADLINE_YEARS.map(k => {
    const c = s.pooled[k - 1]
    return c ? `${pct(c.share)} after ${yearLabel(k)}` : null
  }).filter(Boolean)
  if (pooledText.length) parts.push(`All cohorts: ${pooledText.join(', ')}.`)
  if (highlighted) {
    const last = [...highlighted.years].reverse().find(c => c !== null)
    const reached = highlighted.years.filter(c => c !== null).length
    parts.push(
      `Highlighted ${shortProgramYear(highlighted.programYear)} cohort, ${highlighted.chartered} clubs` +
        (last ? `: ${pct(last.share)} after ${yearLabel(reached)}.` : '.')
    )
  }
  parts.push('Exact values are in the table below.')
  return parts.join(' ')
}

const SurvivalChart: React.FC<{
  survival: SurvivalCurves
  cohorts: CharterCohort[]
  highlighted: CharterCohort | null
}> = ({ survival, cohorts, highlighted }) => {
  const readout = useChartReadout()
  const rows = useMemo(() => buildRows(survival, cohorts), [survival, cohorts])
  const ticks = Array.from({ length: survival.maxYears + 1 }, (_, k) => k)
  return (
    <figure className="survival-figure">
      <ul className="survival-legend" data-testid="survival-legend">
        <li>
          <span className="survival-legend__line survival-legend__line--pooled" />
          All cohorts
        </li>
        {highlighted && (
          <li>
            <span className="survival-legend__line survival-legend__line--cohort" />
            {shortProgramYear(highlighted.programYear)} ({highlighted.chartered}{' '}
            clubs)
          </li>
        )}
        <li>
          <span className="survival-legend__line survival-legend__line--other" />
          Each other cohort
        </li>
      </ul>
      <div
        role="img"
        aria-label={chartDescription(survival, highlighted)}
        className="survival-chart"
        {...readout.surfaceProps}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            {...readout.chartProps}
            data={rows}
            margin={{ top: 8, right: 16, left: 0, bottom: 20 }}
          >
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="year"
              type="number"
              domain={[0, survival.maxYears]}
              ticks={ticks}
              stroke="var(--ink-3)"
              tick={{ fill: 'var(--ink-2)', fontSize: 12 }}
              label={{
                value: 'Years since charter',
                position: 'insideBottom',
                offset: -12,
                fill: 'var(--ink-2)',
                fontSize: 12,
              }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={v => `${v}%`}
              stroke="var(--ink-3)"
              tick={{ fill: 'var(--ink-2)', fontSize: 12 }}
              width={44}
            />
            <Tooltip
              content={
                <SurvivalTooltip
                  survival={survival}
                  highlighted={highlighted}
                />
              }
              {...readout.tooltipProps}
            />
            {cohorts
              .filter(c => c.programYear !== highlighted?.programYear)
              .map(c => (
                <Line
                  key={c.programYear}
                  dataKey={seriesKey(c.programYear)}
                  stroke="var(--ink-3)"
                  strokeOpacity={0.4}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  legendType="none"
                />
              ))}
            <Line
              dataKey="pooled"
              stroke="var(--ink)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--ink)' }}
              isAnimationActive={false}
            />
            {highlighted && (
              <Line
                dataKey={seriesKey(highlighted.programYear)}
                stroke="var(--tm-loyal-blue)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--tm-loyal-blue)' }}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartReadout
        readout={readout}
        describe={label => describeYear(Number(label), survival, highlighted)}
      />
    </figure>
  )
}

/* ── Table ────────────────────────────────────────────────────────────── */

const YearCell: React.FC<{
  cell: { survivors: number; share: number; provisional: boolean } | null
  chartered: number
}> = ({ cell, chartered }) =>
  cell ? (
    <td className="survival-table__num">
      <span className="survival-table__pct">
        {pct(cell.share)}
        {cell.provisional && <span aria-hidden="true">*</span>}
      </span>
      <span className="survival-table__count">
        {cell.survivors} of {chartered}
        {cell.provisional && <span className="sr-only"> (so far)</span>}
      </span>
    </td>
  ) : (
    <td className="survival-table__num survival-table__na">
      <span aria-hidden="true">—</span>
      <span className="sr-only">not reached</span>
    </td>
  )

const SurvivalTable: React.FC<{
  survival: SurvivalCurves
  selected: string | null
  movedHeader: string | null
}> = ({ survival, selected, movedHeader }) => {
  const years = Array.from({ length: survival.maxYears }, (_, i) => i + 1)
  const hasProvisional = survival.cohorts.some(c =>
    c.years.some(y => y?.provisional)
  )
  return (
    <div
      className="survival-table__scroll"
      role="region"
      aria-label="Survival table, scrolls sideways"
      tabIndex={0}
    >
      <table className="survival-table">
        <caption className="survival-table__caption">
          Survival by charter year — share of each cohort still active after
          each year
        </caption>
        <thead>
          <tr>
            <th scope="col">Chartered in</th>
            <th scope="col" className="survival-table__num">
              Clubs
            </th>
            {movedHeader && (
              <th scope="col" className="survival-table__num">
                {movedHeader}
              </th>
            )}
            {years.map(k => (
              <th key={k} scope="col" className="survival-table__num">
                Year {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {survival.cohorts.map(c => (
            <tr
              key={c.programYear}
              className={c.programYear === selected ? 'is-highlighted' : ''}
            >
              <th scope="row">{shortProgramYear(c.programYear)}</th>
              {c.chartered === 0 ? (
                <>
                  <td className="survival-table__num">0</td>
                  <td
                    className="survival-table__none"
                    colSpan={years.length + (movedHeader ? 1 : 0)}
                  >
                    None chartered
                  </td>
                </>
              ) : (
                <>
                  <td className="survival-table__num">{c.chartered}</td>
                  {movedHeader && (
                    <td className="survival-table__num">{c.movedAway}</td>
                  )}
                  {years.map(k => (
                    <YearCell
                      key={k}
                      cell={c.years[k - 1] ?? null}
                      chartered={c.chartered}
                    />
                  ))}
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All cohorts</th>
            <td className="survival-table__num">
              {survival.cohorts.reduce((n, c) => n + c.chartered, 0)}
            </td>
            {movedHeader && (
              <td className="survival-table__num">
                {survival.cohorts.reduce((n, c) => n + c.movedAway, 0)}
              </td>
            )}
            {years.map(k => {
              const p = survival.pooled[k - 1] ?? null
              return (
                <YearCell key={k} cell={p} chartered={p ? p.chartered : 0} />
              )
            })}
          </tr>
        </tfoot>
      </table>
      {hasProvisional && (
        <p className="survival-note">
          * So far: {shortProgramYear(survival.throughProgramYear)} is still in
          progress, so a club counted as active can still close.
        </p>
      )}
    </div>
  )
}

/* ── View ─────────────────────────────────────────────────────────────── */

export const CharterSurvivalView: React.FC<{
  survival: SurvivalCurves
  /** Whose cohorts these are (#1818); the district page by default. */
  scope?: SurvivalScope
}> = ({ survival, scope = { kind: 'district' } }) => {
  const copy = scopeCopy(scope)
  const [params] = useSearchParams()
  const cohorts = useMemo(
    () => survival.cohorts.filter(c => c.chartered > 0),
    [survival.cohorts]
  )
  const requested = params.get(COHORT_PARAM)
  const highlighted = cohorts.find(c => c.programYear === requested) ?? null

  return (
    <section className="survival-page" aria-labelledby="survival-title">
      <h2 id="survival-title" className="survival-page__title">
        Club survival by charter year
      </h2>
      <p className="survival-page__subtitle">
        Of the clubs chartered {copy.where} in each program year, the share
        still active 1, 2, 3… years later, through{' '}
        {shortProgramYear(survival.throughProgramYear)}. {copy.movedNote}
      </p>

      {cohorts.length === 0 ? (
        <p className="survival-empty">
          No clubs were chartered{' '}
          {copy.where === 'here' ? 'in this district' : copy.where} between{' '}
          {survival.censoredProgramYear
            ? shortProgramYear(
                survival.cohorts[0]?.programYear ?? survival.throughProgramYear
              )
            : 'the start of the history'}{' '}
          and {shortProgramYear(survival.throughProgramYear)}. Pick a later
          program year above{copy.elsewhere ? `, ${copy.elsewhere}` : ''}.
        </p>
      ) : (
        <>
          <Headline pooled={survival.pooled} />
          <CohortLinks
            cohorts={cohorts}
            selected={highlighted?.programYear ?? null}
          />
          <SurvivalChart
            survival={survival}
            cohorts={cohorts}
            highlighted={highlighted}
          />
          <SurvivalTable
            survival={survival}
            selected={highlighted?.programYear ?? null}
            movedHeader={copy.movedHeader}
          />
        </>
      )}

      {survival.censoredProgramYear && (
        <p className="survival-note">
          Clubs first seen in {shortProgramYear(survival.censoredProgramYear)}{' '}
          are left out: the history starts in that program year, so it cannot
          tell which of them were chartered then. {copy.cohortDefinition};{' '}
          {copy.movedNote.charAt(0).toLowerCase() + copy.movedNote.slice(1)}{' '}
          History as of {survival.asOf}.
        </p>
      )}
    </section>
  )
}
