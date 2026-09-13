import React from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  ClubRaceTier,
  GlobalClubRaceTimelinePoint,
} from '@taverns-red/shared-contracts'
import { RACE_TIER_ROUTES, raceTierTitle } from '../../utils/raceTierRoute'

/* #1556 — the cumulative race chart ("the pack"): clubs at or past each line
   per observed snapshot date, as a STEP line — a crossing is a step, not a
   slope, and the days between snapshots were never observed, so nothing is
   interpolated across a gap. Y is padded symmetrically when the range is 0
   (tripwire: a `|| 1` fallback inverts the axis). Animation is off under
   prefers-reduced-motion. */

export interface RaceChartProps {
  timeline: readonly GlobalClubRaceTimelinePoint[]
  /** The Smedley series is omitted for program years without the rung (#1406). */
  smedleyAvailable: boolean
}

/* Brand hexes (rt-brand-v1.css): Recharts sets `stroke` as an SVG attribute,
   where `var()` does not resolve, so the token VALUES are restated here and
   nowhere else in this feature. */
const SERIES_COLOUR: Record<ClubRaceTier, string> = {
  Distinguished: '#D4873F', // --rt-stats
  Select: '#E63946', // --rt-red
  President: '#8E1B25', // --rt-red-dk
  Smedley: '#3D3B38', // --rt-ink-2
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

const shortDate = (iso: string): string => iso.slice(5)

export const RaceChart: React.FC<RaceChartProps> = ({
  timeline,
  smedleyAvailable,
}) => {
  const series = RACE_TIER_ROUTES.filter(
    r => smedleyAvailable || r.tier !== 'Smedley'
  )
  const values = timeline.flatMap(p => series.map(s => p[s.tier]))
  const max = values.length ? Math.max(...values) : 0
  const min = values.length ? Math.min(...values) : 0
  // Symmetric padding when flat, so the axis never inverts (tripwire).
  const domain: [number, number] =
    max === min ? [Math.max(0, min - 1), max + 1] : [0, max]
  const animate = !prefersReducedMotion()

  return (
    <figure
      className="race-chart"
      aria-label="Cumulative clubs per tier by snapshot date"
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={[...timeline]}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.15}
          />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} />
          <YAxis domain={domain} allowDecimals={false} width={40} />
          <Tooltip labelFormatter={label => `Snapshot ${String(label)}`} />
          <Legend />
          {series.map(({ tier }) => (
            <Line
              key={tier}
              type="stepAfter"
              dataKey={tier}
              name={raceTierTitle(tier)}
              stroke={SERIES_COLOUR[tier]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={animate}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <figcaption className="clubs-page__eyebrow">
        Cumulative clubs at or past each line, per observed snapshot date. Gaps
        between snapshots are not interpolated.
      </figcaption>
    </figure>
  )
}

export default RaceChart
