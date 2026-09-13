import React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
import {
  stackedRaceTimeline,
  totalRecognised,
  type ClubRaceTierCounts,
} from '../../utils/clubRaceCounts'

/* #1556 / #1570 — the cumulative race chart ("the pack"). The total still
   rises to the recognised count; the bands show the tier MIX inside it, each
   club in exactly one band, so the chart says the same thing as the KPI
   tiles above it instead of counting a President's club three times.

   Still a STEP: a crossing is a step, not a slope, and the days between
   snapshots were never observed, so nothing is interpolated across a gap.
   The exclusive bands are derived arithmetically from the artifact's
   cumulative points (`stackedRaceTimeline`) — frontend-only, no artifact or
   schema change — and the FINAL point is anchored to current standing so it
   matches the tiles the first day a club slips. Animation is off under
   prefers-reduced-motion. */

export interface RaceChartProps {
  timeline: readonly GlobalClubRaceTimelinePoint[]
  /** The Smedley series is omitted for program years without the rung (#1406). */
  smedleyAvailable: boolean
  /** Current-standing tile figures; anchors the last point (#1570). */
  currentCounts: ClubRaceTierCounts
}

/* Brand hexes (rt-brand-v1.css): Recharts sets `stroke`/`fill` as SVG
   attributes, where `var()` does not resolve, so the token VALUES are
   restated here and nowhere else in this feature. */
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
  currentCounts,
}) => {
  const series = RACE_TIER_ROUTES.filter(
    r => smedleyAvailable || r.tier !== 'Smedley'
  )
  const data = stackedRaceTimeline(timeline, currentCounts)
  // The stack's height is the cumulative total, not any one band.
  const totals = data.map(p => series.reduce((sum, s) => sum + p[s.tier], 0))
  const max = totals.length ? Math.max(...totals) : 0
  const min = totals.length ? Math.min(...totals) : 0
  // Symmetric padding when flat, so the axis never inverts (tripwire).
  const domain: [number, number] =
    max === min ? [Math.max(0, min - 1), max + 1] : [0, max]
  const animate = !prefersReducedMotion()

  return (
    <figure
      className="race-chart"
      aria-label="Clubs recognised per snapshot date, banded by tier"
    >
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
          data={data}
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
            <Area
              key={tier}
              type="stepAfter"
              dataKey={tier}
              stackId="tiers"
              name={raceTierTitle(tier)}
              stroke={SERIES_COLOUR[tier]}
              fill={SERIES_COLOUR[tier]}
              fillOpacity={0.85}
              strokeWidth={1}
              dot={false}
              isAnimationActive={animate}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <figcaption className="clubs-page__eyebrow">
        Clubs recognised per observed snapshot date, banded by the tier each
        holds — every club counted once. The stack reaches{' '}
        {totalRecognised(currentCounts)} today. Gaps between snapshots are not
        interpolated.
      </figcaption>
    </figure>
  )
}

export default RaceChart
