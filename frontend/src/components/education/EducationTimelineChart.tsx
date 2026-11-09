import React, { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EducationTimelineEntity } from '@taverns-red/shared-contracts'
import {
  deriveTimeline,
  timelineDate,
  timelineT,
  TIMELINE_DAY_MS,
  type TimelineMode,
} from '../../utils/educationTimelineBands'
import {
  useChartReadout,
  ChartReadout,
  formatReadoutDate,
} from '../charts/ChartReadout'

/* #2592 (epic #2590) — awards over time on the Education pages, in the Clubs
   RaceChart's grammar: a cumulative STEP chart, so a snapshot is a step and
   the days between snapshots, never observed, are not interpolated. The
   stack's height is every award to date (what the KPI tiles above print);
   the bands show the mix -- levels and DTMs, or the top paths plus Other.

   A faint dashed line is last year's cumulative total at the same point in
   the program year. It steps the same way and is never joined across a gap;
   with no prior year there is no line, only a note.

   Dataviz rules honoured here: one axis (no dual axis), text in ink tokens
   (colour is only a swatch, never the only signal -- every band is named in
   the legend with its value), animation off under prefers-reduced-motion,
   and the same numbers offered as a table. Colours are the legacy palette
   (#2080) bound by hook in education-timeline.css, where the dark-mode
   values live; Recharts' SVG attributes cannot read var(). */

export interface EducationTimelineChartProps {
  timeline: EducationTimelineEntity
  mode: TimelineMode
  /** The page's selected date: later points are left out (R3). */
  through?: string | undefined
  /** The KPI tiles' awards figure and the date they are as of. */
  tilesTotal: number
  tilesAsOf: string | null
  /** Notes printed under the legend (legacy / other award codes). */
  notes?: React.ReactNode
}

const GHOST_KEY = 'ghost'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const fmt = (n: number): string => n.toLocaleString('en-US')
const shortPy = (py: string): string => `${py.slice(0, 4)}-${py.slice(7)}`
/** "Oct 4" for the axis; the year is in the headline and the readout. */
const axisDate = (iso: string): string =>
  formatReadoutDate(iso).replace(/, \d{4}$/, '')

const monthName = (t: number): string =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

/** The first of every month inside [from, to], as time-axis values. */
function monthStarts(from: number, to: number): number[] {
  const out: number[] = []
  const d = new Date(from)
  let y = d.getUTCFullYear()
  let m = d.getUTCMonth()
  if (d.getUTCDate() > 1) m += 1
  for (let t = Date.UTC(y, m, 1); t <= to; t = Date.UTC(y, ++m, 1)) {
    out.push(t)
  }
  return out
}

const GHOST_GRAIN_NOTE = {
  day: 'a daily step from last year’s own timeline',
  month: 'a month-end step from the education ledger history',
} as const

export const EducationTimelineChart: React.FC<EducationTimelineChartProps> = ({
  timeline,
  mode,
  through,
  tilesTotal,
  tilesAsOf,
  notes,
}) => {
  // Tap-to-pin readout on devices without hover (#1835) — before early returns.
  const readout = useChartReadout()
  const { prior } = timeline
  const { bands, rows } = useMemo(
    () =>
      deriveTimeline({
        points: timeline.points,
        mode,
        prior,
        through,
      }),
    [timeline.points, mode, prior, through]
  )

  /* A TIME axis, so a three-week gap between snapshots looks like one. Each
     row is a snapshot; one display-only TAIL row repeats the final values a
     little further right, because a step holds its value AFTER its date and
     the latest snapshot would otherwise have no width to be seen in. The tail
     keeps the final date, so a tooltip over it still reads that snapshot. */
  const { data, tFirst, tLast, tEnd } = useMemo(() => {
    const base = rows.map(r => ({
      date: r.date,
      t: timelineT(r.date),
      total: r.total,
      [GHOST_KEY]: r.ghost,
      ...r.values,
    }))
    const first = base[0]?.t ?? 0
    const last = base[base.length - 1]?.t ?? 0
    const span = last - first
    const pad = Math.max(
      2 * TIMELINE_DAY_MS,
      Math.round((span * 0.04) / TIMELINE_DAY_MS) * TIMELINE_DAY_MS
    )
    const tail = base.length
      ? [{ ...base[base.length - 1]!, t: last + pad, tail: true }]
      : []
    return {
      data: [...base, ...tail],
      tFirst: first,
      tLast: last,
      tEnd: last + pad,
    }
  }, [rows])

  const ticks = useMemo(() => monthStarts(tFirst, tLast), [tFirst, tLast])
  const byMonth = ticks.length >= 2
  const axisTick = (t: number): string =>
    byMonth ? monthName(t) : axisDate(timelineDate(t))
  /** The snapshot a time-axis position reads: the tail reads the final one. */
  const snapshotLabel = (t: number | string): string =>
    formatReadoutDate(timelineDate(Math.min(Number(t), tLast)))

  const final = rows[rows.length - 1]
  const peak = Math.max(0, ...rows.map(r => Math.max(r.total, r.ghost ?? 0)))
  const floor = Math.min(
    ...rows.map(r => Math.min(r.total, r.ghost ?? Infinity))
  )
  // Symmetric padding when flat, so the axis never inverts (tripwire).
  const domain: [number, number] =
    peak === floor ? [Math.max(0, floor - 1), peak + 1] : [0, peak]
  const animate = !prefersReducedMotion()

  if (!final) return null

  const matches =
    final.total === tilesTotal &&
    (tilesAsOf === null || final.date === tilesAsOf)
  const ghostName = prior ? `Last year (${shortPy(prior.programYear)})` : null

  return (
    <figure
      {...readout.surfaceProps}
      className="edu-tl"
      aria-label="Education awards to date, by snapshot date"
    >
      <p className="edu-tl__headline" data-testid="education-timeline-headline">
        <span className="edu-tl__headline-value">
          {fmt(final.total)} awards
        </span>{' '}
        <span className="edu-tl__headline-date">
          as of {formatReadoutDate(final.date)}
        </span>
      </p>
      {!matches && (
        <p
          className="edu-tl__mismatch"
          role="note"
          data-testid="education-timeline-mismatch"
        >
          This chart runs to {formatReadoutDate(final.date)} and totals{' '}
          {fmt(final.total)} awards. The figures above are {fmt(tilesTotal)}
          {tilesAsOf ? ` as of ${formatReadoutDate(tilesAsOf)}` : ''}: they come
          from different report dates.
        </p>
      )}

      <div className="edu-tl__plot">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            {...readout.chartProps}
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              opacity={0.15}
            />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[tFirst, tEnd]}
              ticks={byMonth ? ticks : [tFirst, tLast]}
              tickFormatter={axisTick}
              minTickGap={16}
              tick={{ fontSize: 13 }}
            />
            <YAxis
              domain={domain}
              allowDecimals={false}
              width={48}
              tick={{ fontSize: 13 }}
              tickFormatter={fmt}
            />
            <Tooltip
              labelFormatter={label =>
                `Snapshot ${snapshotLabel(String(label))}`
              }
              formatter={value => fmt(Number(value))}
              {...readout.tooltipProps}
            />
            {bands.map(b => (
              <Area
                key={b.key}
                className={`edu-tl__band edu-tl-c--${b.colour}`}
                type="stepAfter"
                dataKey={b.key}
                stackId="awards"
                name={b.label}
                stroke="currentColor"
                fill="currentColor"
                fillOpacity={0.9}
                strokeWidth={1}
                dot={false}
                isAnimationActive={animate}
              />
            ))}
            {prior && (
              <Line
                className="edu-tl__ghost"
                type="stepAfter"
                dataKey={GHOST_KEY}
                name={ghostName ?? 'Last year'}
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeOpacity={0.6}
                dot={false}
                connectNulls={false}
                isAnimationActive={animate}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartReadout
        readout={readout}
        labelFormatter={t => `Snapshot ${snapshotLabel(t)}`}
      />

      <ul className="edu-tl__legend" aria-label="Chart legend">
        {bands.map(b => (
          <li key={b.key} className="edu-tl__legend-item">
            <span
              className={`edu-tl__swatch edu-tl-c--${b.colour}`}
              aria-hidden="true"
            />
            <span className="edu-tl__legend-label">{b.label}</span>
            <span className="edu-tl__legend-value">
              {fmt(final.values[b.key] ?? 0)}
            </span>
          </li>
        ))}
        {ghostName && (
          <li className="edu-tl__legend-item">
            <span
              className="edu-tl__swatch edu-tl__swatch--ghost"
              aria-hidden="true"
            />
            <span className="edu-tl__legend-label">{ghostName}</span>
            {final.ghost !== null && (
              <span className="edu-tl__legend-value">{fmt(final.ghost)}</span>
            )}
          </li>
        )}
      </ul>

      <p className="edu-tl__note" data-testid="education-timeline-ghost-note">
        {prior
          ? `The dashed line is last year’s total at the same point in the program year (${GHOST_GRAIN_NOTE[prior.grain]}). `
          : 'Last year is not available for this view. '}
        Each step is a snapshot date; nothing is drawn between snapshots.
      </p>
      {notes}

      <details className="edu-tl__data">
        <summary className="edu-tl__data-toggle">Show as a table</summary>
        <div
          className="edu-tl__table-scroll"
          role="region"
          tabIndex={0}
          aria-label="Education awards by snapshot date — scroll to see all columns"
        >
          <table
            className="edu-tl__table"
            aria-label="Education awards by snapshot date"
          >
            <thead>
              <tr>
                <th scope="col">Date</th>
                {bands.map(b => (
                  <th key={b.key} scope="col">
                    {b.label}
                  </th>
                ))}
                <th scope="col">Total</th>
                {prior && <th scope="col">Last year</th>}
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map(r => (
                <tr key={r.date}>
                  <th scope="row">{formatReadoutDate(r.date)}</th>
                  {bands.map(b => (
                    <td key={b.key}>{fmt(r.values[b.key] ?? 0)}</td>
                  ))}
                  <td className="edu-tl__table-total">{fmt(r.total)}</td>
                  {prior && <td>{r.ghost === null ? '—' : fmt(r.ghost)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

export default EducationTimelineChart
