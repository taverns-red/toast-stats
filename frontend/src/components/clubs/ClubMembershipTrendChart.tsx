import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  buildMembershipTrendChartData,
  lastOf,
  type PriorYearTrend,
  type TrendPoint,
  type TrendSeries,
} from '../membershipTrendChartData'
import { formatDisplayDate } from '../../utils/dateFormatting'

/**
 * #1791 — the club page's membership trend, with prior program years drawn
 * faint behind the current line.
 *
 * Placement and the D15 anchor come from #1705's shared builder
 * (`buildMembershipTrendChartData`), the one the district membership chart
 * uses: every series is placed by program-year day, and the current line
 * starts at day 0 on the predecessor's 06-30 close when that close exists.
 * The anchor is plotted, never a data dot, and the page's stats use the
 * current year's own points only.
 *
 * Prior years come from the club's year-end rows (base on July 1, close at
 * the year-end snapshot), so each is a straight two-point line: it shows
 * where the year started and ended, not its path.
 *
 * Hand-rolled SVG (not Recharts): the club route keeps Recharts off its
 * static graph (#1901), and CSS classes carry the dark-mode swap (R10).
 * Tap-to-pin instead of a hover tooltip: a tap or click pins the nearest
 * current-year point, arrow keys move it, and a readout under the chart says
 * the value in words.
 *
 * The viewBox width follows the plot's measured width, so one SVG unit is
 * one CSS pixel: the 12px ticks stay 12px in a 343px phone sheet instead of
 * being squeezed by a stretched 800-unit box (review §5.3).
 */
const CHART = { W: 800, H: 260, PT: 14, PR: 14, PB: 26, PL: 36 }
const INNER_H = CHART.H - CHART.PT - CHART.PB
const MIN_W = 280
const PY_DAYS = 365

const KEY_DATES = [
  { day: 0, label: 'Jul 1', description: 'Program Year Start' },
  { day: 92, label: 'Oct 1', description: 'October Renewals' },
  { day: 275, label: 'Apr 1', description: 'April Renewals' },
  { day: 365, label: 'Jun 30', description: 'Program Year End' },
]

/** "2025-2026" → "2025–26". */
const shortYearLabel = (label: string): string => {
  const m = /^(\d{4})-\d{2}(\d{2})$/.exec(label)
  return m ? `${m[1]}–${m[2]}` : label
}

export interface ClubMembershipTrendChartProps {
  /** The page program year's points (R3: filtered by the page). */
  current: TrendPoint[]
  /** Completed earlier program years, newest first. */
  priors: PriorYearTrend[]
  /** The page's program year, e.g. "2026-2027" (R3). */
  programYearLabel: string
}

export function ClubMembershipTrendChart({
  current,
  priors,
  programYearLabel,
}: ClubMembershipTrendChartProps) {
  const { series } = useMemo(
    () => buildMembershipTrendChartData(current, priors, programYearLabel),
    [current, priors, programYearLabel]
  )
  // Measured plot width (800 until measured, e.g. in jsdom).
  const plotRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(CHART.W)
  useLayoutEffect(() => {
    const el = plotRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      if (w > 0) setW(Math.max(MIN_W, w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const innerW = W - CHART.PL - CHART.PR

  const currentSeries = series[0] as TrendSeries
  const priorSeries = series.slice(1).filter(s => s.points.length > 0)
  const dataPoints = currentSeries.points.filter(p => !p.anchor)

  // y over every plotted value; ±4 keeps a flat series off the edges and
  // makes the range provably non-zero (the `range === 0` tripwire).
  const values = series.flatMap(s => s.points.map(p => p.count))
  const yMin = values.length ? Math.max(0, Math.min(...values) - 4) : 0
  const yMax = values.length ? Math.max(...values) + 4 : 8
  const yRange = yMax - yMin
  const x = (day: number) => CHART.PL + (day / PY_DAYS) * innerW
  const y = (count: number) =>
    CHART.PT + (1 - (count - yMin) / yRange) * INNER_H
  const line = (s: TrendSeries) =>
    s.points
      .map(p => `${x(p.day).toFixed(1)},${y(p.count).toFixed(1)}`)
      .join(' ')

  const [pinned, setPinned] = useState<number | null>(null)
  const pinIndex = Math.min(
    pinned ?? dataPoints.length - 1,
    dataPoints.length - 1
  )
  const pin = dataPoints[pinIndex]

  const pinNearest = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width === 0 || dataPoints.length === 0) return
    const svgX = ((e.clientX - box.left) / box.width) * W
    const day = ((svgX - CHART.PL) / innerW) * PY_DAYS
    let best = 0
    dataPoints.forEach((p, i) => {
      if (Math.abs(p.day - day) < Math.abs(dataPoints[best]!.day - day))
        best = i
    })
    setPinned(best)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (dataPoints.length === 0) return
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (e.key === 'Home') setPinned(0)
    else if (e.key === 'End') setPinned(dataPoints.length - 1)
    else if (step !== 0)
      setPinned(Math.min(dataPoints.length - 1, Math.max(0, pinIndex + step)))
    else return
    e.preventDefault()
  }

  const pyDisplay = shortYearLabel(programYearLabel)
  // The three most recent closes keep the readout to two lines at 375.
  const closes = priorSeries
    .slice(0, 3)
    .map(s => {
      const close = lastOf(s.points)
      return close ? `${shortYearLabel(s.label)} ${close.count}` : null
    })
    .filter(Boolean)

  return (
    <div className="club-trend">
      {/* One line whatever the number of years, so the prior years landing
          after the first render change text, not layout (no CLS). */}
      <ul className="club-trend__legend" aria-label="Program years">
        <li className="club-trend__legend-item club-trend__legend-item--current">
          <span className="club-trend__swatch" aria-hidden="true" />
          {pyDisplay}
        </li>
        {priorSeries.length > 0 && (
          <li className="club-trend__legend-item club-trend__legend-item--prior">
            <span className="club-trend__swatch" aria-hidden="true" />
            {priorSeries.length === 1
              ? shortYearLabel(priorSeries[0]!.label)
              : `${shortYearLabel(lastOf(priorSeries)!.label)} to ${shortYearLabel(priorSeries[0]!.label)}`}{' '}
            (start and year-end)
          </li>
        )}
      </ul>

      <div
        className="club-trend__plot"
        ref={plotRef}
        tabIndex={0}
        role="group"
        aria-label="Membership trend points: use the arrow keys to move between dates"
        onKeyDown={onKeyDown}
      >
        <svg
          className="mem-chart"
          viewBox={`0 0 ${W} ${CHART.H}`}
          role="img"
          aria-label={`Membership trend for program year ${pyDisplay}${
            priorSeries.length
              ? `, with ${priorSeries.length} earlier year${priorSeries.length === 1 ? '' : 's'} faint behind it`
              : ''
          }`}
          onPointerDown={pinNearest}
        >
          {[0, 1, 2, 3].map(i => {
            const v = yMin + yRange * (i / 3)
            return (
              <g key={`grid-${i}`}>
                <line
                  className="grid"
                  x1={CHART.PL}
                  y1={y(v)}
                  x2={W - CHART.PR}
                  y2={y(v)}
                />
                <text
                  className="axis-text"
                  x={CHART.PL - 6}
                  y={y(v) + 4}
                  textAnchor="end"
                >
                  {Math.round(v)}
                </text>
              </g>
            )
          })}

          {KEY_DATES.map(kd => (
            <g key={kd.label}>
              <line
                className="key-line"
                x1={x(kd.day)}
                y1={CHART.PT}
                x2={x(kd.day)}
                y2={CHART.H - CHART.PB}
              >
                <title>{kd.description}</title>
              </line>
              <text
                className="key-text"
                x={x(kd.day)}
                y={CHART.H - 10}
                textAnchor={
                  kd.day === 0 ? 'start' : kd.day === PY_DAYS ? 'end' : 'middle'
                }
              >
                {kd.label}
              </text>
            </g>
          ))}

          {/* Earlier years first, so the current line draws on top. */}
          {priorSeries.map((s, i) => (
            <polyline
              key={s.key}
              className={`line--prior line--prior-${Math.min(i, 2)}`}
              data-year={s.label}
              points={line(s)}
            />
          ))}

          {currentSeries.points.length > 1 && (
            <>
              <polygon
                className="area"
                points={`${line(currentSeries)} ${x(lastOf(currentSeries.points)!.day).toFixed(1)},${(CHART.PT + INNER_H).toFixed(1)} ${x(currentSeries.points[0]!.day).toFixed(1)},${(CHART.PT + INNER_H).toFixed(1)}`}
              />
              <polyline className="line" points={line(currentSeries)} />
            </>
          )}

          {pin && (
            <line
              className="pin-line"
              x1={x(pin.day)}
              y1={CHART.PT}
              x2={x(pin.day)}
              y2={CHART.H - CHART.PB}
            />
          )}

          {dataPoints.map((p, i) => (
            <circle
              key={p.date}
              className={i === pinIndex ? 'dot dot--pinned' : 'dot'}
              cx={x(p.day)}
              cy={y(p.count)}
              r={i === pinIndex ? 5 : 3}
            />
          ))}
        </svg>
      </div>

      {pin && (
        <p
          className="club-trend__readout"
          data-testid="club-trend-readout"
          aria-live="polite"
        >
          <strong>{formatDisplayDate(pin.date)}</strong> · {pyDisplay}:{' '}
          {pin.count} members
          {closes.length > 0 && (
            <span className="club-trend__closes">
              {' '}
              · Year-end: {closes.join(' · ')}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
