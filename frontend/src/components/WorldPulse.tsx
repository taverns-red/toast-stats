/* WorldPulse (#2249) — the landing's world and region section, for
   international leaders and observers. No new pipeline data: every figure
   comes from a file the site already reads.

     attention tiles  snapshots/{date}/region-rollups.json — useRegionRollups,
                      the same query /regions/health shares (#1815)
     sparkline        time-series/regions/{PY}.json — the /regions sparklines'
                      file, same query key as useRegionTrends (#2127)
     region table     the rankings rows the page already holds, summed per
                      region (no fetch)

   CLS (Lesson 107): every data-fed slot keeps its box while its query is in
   flight, and the loading shell renders this same component with
   `reserve` so nothing is inserted when the data lands. An absent file
   reads "Not available" — never 0. Legacy palette only (#2080). */

import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useRegionRollups } from '../hooks/useRegionRollups'
import { fetchCdnRegionMembershipSeries } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

/** The four fields the section reads from a rankings row. */
export interface WorldPulseRow {
  districtId: string
  region: string
  paidClubs: number
  paidClubBase: number
}

interface WorldPulseProps {
  rows: readonly WorldPulseRow[]
  date: SnapshotDate | undefined
  /** "YYYY-YYYY", the page's program year (R3). */
  programYear: string
  /** The loading shell: same boxes, no links, no numbers. */
  reserve?: boolean
}

const TOP_REGION_ROWS = 5

const fmt = (n: number) => n.toLocaleString()
const signed = (n: number) =>
  n === 0 ? '0' : `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`

interface RegionSummary {
  region: string
  districts: number
  paidClubs: number
  delta: number
}

function summarizeRegions(rows: readonly WorldPulseRow[]): RegionSummary[] {
  const by = new Map<string, RegionSummary>()
  for (const r of rows) {
    const s = by.get(r.region) ?? {
      region: r.region,
      districts: 0,
      paidClubs: 0,
      delta: 0,
    }
    s.districts += 1
    s.paidClubs += r.paidClubs ?? 0
    s.delta += (r.paidClubs ?? 0) - (r.paidClubBase ?? 0)
    by.set(r.region, s)
  }
  // Largest first (review S1): the section shows the five biggest regions
  // at every width and links to the rest.
  return Array.from(by.values()).sort(
    (a, b) => b.paidClubs - a.paidClubs || a.region.localeCompare(b.region)
  )
}

const regionLabel = (region: string) =>
  /^\d+$/.test(region) ? `Region ${Number(region)}` : region

/** The world membership points for this PY up to `date`, gaps skipped. */
function worldPoints(
  series: { dates: string[]; world: { membership: (number | null)[] } },
  date: string | undefined
): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = []
  series.dates.forEach((d, i) => {
    const v = series.world.membership[i]
    if (v === null || v === undefined) return
    if (date && d > date) return
    out.push({ date: d, value: v })
  })
  return out
}

/** Toastmasters dues are semi-annual: members who have not renewed drop
    off the count on Oct 1 and Apr 1, then return as they pay. A line that
    crosses either date falling reads as a collapse unless it says so
    (review S3). Returns the renewal date the line dips across, if any. */
function renewalDip(
  points: Array<{ date: string; value: number }>
): 'Oct 1' | 'Apr 1' | null {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const cur = points[i]!
    if (cur.value >= prev.value) continue
    for (const [md, name] of [
      ['10-01', 'Oct 1'],
      ['04-01', 'Apr 1'],
    ] as const) {
      const year = cur.date.slice(0, 4)
      const boundary = `${year}-${md}`
      if (prev.date < boundary && cur.date >= boundary) return name
    }
  }
  return null
}

const SPARK_W = 240
const SPARK_H = 48

const Sparkline: React.FC<{
  points: Array<{ date: string; value: number }>
  dip: string | null
}> = ({ points, dip }) => {
  const min = Math.min(...points.map(p => p.value))
  const max = Math.max(...points.map(p => p.value))
  // Pad symmetrically when the range is zero (tripwire: no `|| 1` fallback).
  const pad = max === min ? Math.max(1, Math.abs(max) * 0.01) : 0
  const lo = min - pad
  const hi = max + pad
  const step = points.length > 1 ? SPARK_W / (points.length - 1) : 0
  const coords = points
    .map((p, i) => {
      const x = (i * step).toFixed(1)
      const y = (SPARK_H - ((p.value - lo) / (hi - lo)) * SPARK_H).toFixed(1)
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="world-pulse__sparkline-svg"
      role="img"
      aria-label={`Members this program year, ${fmt(points[0]!.value)} to ${fmt(points[points.length - 1]!.value)}${dip ? `; the drop at ${dip} is the dues renewal, as members who have not renewed leave the count until they pay` : ''}`}
      data-testid="pulse-sparkline"
    >
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A numeric column head (re-review R1): the full label is the header's
    accessible name at every width; below 768px it is only visually hidden
    and an aria-hidden short label shows, so a ~48px phone column never
    splits a word. */
const HeadLabel: React.FC<{ long: string; short: string }> = ({
  long,
  short,
}) => (
  <>
    <span className="world-pulse__th-long">{long}</span>
    <span className="world-pulse__th-short" aria-hidden="true">
      {short}
    </span>
  </>
)

export const WorldPulse: React.FC<WorldPulseProps> = ({
  rows,
  date,
  programYear,
  reserve = false,
}) => {
  const { rollups, isLoading: rollupsLoading } = useRegionRollups(date)
  const world = rollups?.world ?? null

  // The /regions sparklines' file, under its own query key so the cache is
  // shared; reserve mode never fetches (the shell has no year to trust yet).
  const { data: series, isPending: seriesPending } = useQuery({
    queryKey: ['region-membership-series', programYear] as const,
    queryFn: () => fetchCdnRegionMembershipSeries(programYear),
    staleTime: 15 * 60 * 1000,
    enabled: !reserve,
  })
  const points = useMemo(
    () => (series ? worldPoints(series, date) : []),
    [series, date]
  )
  const dip = useMemo(() => renewalDip(points), [points])

  const regions = useMemo(() => summarizeRegions(rows), [rows])
  const shownRegions = regions.slice(0, TOP_REGION_ROWS)

  const figure = (n: number | null | undefined): string => {
    if (reserve || rollupsLoading) return '—'
    if (n === null || n === undefined) return 'Not available'
    return fmt(n)
  }

  const headingId = 'world-pulse-heading'

  return (
    <section
      className={`world-pulse${reserve ? ' world-pulse--reserve' : ''}`}
      aria-labelledby={headingId}
      aria-hidden={reserve || undefined}
    >
      <div className="world-pulse__head">
        <h2 id={headingId} className="world-pulse__title">
          World pulse
        </h2>
        {reserve ? (
          <span className="world-pulse__all">All regions →</span>
        ) : (
          <Link to="/regions" className="world-pulse__all">
            All regions <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>

      <div className="world-pulse__grid">
        <ul className="world-pulse__tiles" aria-label="Clubs this program year">
          <li className="world-pulse__tile">
            {reserve ? (
              <span className="world-pulse__tile-label">
                Clubs needing attention
              </span>
            ) : (
              <Link to="/regions/health" className="world-pulse__tile-label">
                Clubs needing attention
              </Link>
            )}
            <span
              className="world-pulse__tile-value"
              data-testid="pulse-attention"
            >
              {figure(world?.health.interventionRequired)}
            </span>
          </li>
          <li className="world-pulse__tile">
            <span className="world-pulse__tile-label">Chartered this year</span>
            <span
              className="world-pulse__tile-value"
              data-testid="pulse-chartered"
            >
              {figure(world?.growth.chartered)}
            </span>
          </li>
          <li className="world-pulse__tile">
            <span className="world-pulse__tile-label">Suspended this year</span>
            <span
              className="world-pulse__tile-value"
              data-testid="pulse-suspended"
            >
              {figure(world?.growth.suspended)}
            </span>
          </li>
        </ul>

        <div className="world-pulse__sparkline">
          <span className="world-pulse__tile-label">
            Members this program year
          </span>
          {reserve || seriesPending ? (
            <div className="world-pulse__sparkline-box" />
          ) : points.length > 1 ? (
            <>
              <Sparkline points={points} dip={dip} />
              <span
                className="world-pulse__caption"
                data-testid="pulse-sparkline-caption"
              >
                {fmt(points[0]!.value)} →{' '}
                {fmt(points[points.length - 1]!.value)}
                {/* Inline, not a new line: the caption lands after the data,
                    so a second line would shift the page (Lesson 107). */}
                {dip && (
                  <span
                    data-testid="pulse-sparkline-note"
                    title="Members who have not renewed their dues yet leave the count on Oct 1 and Apr 1, and return as they pay."
                  >
                    {' '}
                    · {dip} dues renewal
                  </span>
                )}
              </span>
            </>
          ) : (
            <span className="world-pulse__caption">
              No membership series for this year yet.
            </span>
          )}
        </div>
      </div>

      <div className="world-pulse__regions">
        <table className="world-pulse__table" aria-label="Regions">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Region</th>
              <th scope="col" className="world-pulse__num">
                <HeadLabel long="Districts" short="Dist." />
              </th>
              <th scope="col" className="world-pulse__num">
                <HeadLabel long="Paid clubs" short="Clubs" />
              </th>
              <th scope="col" className="world-pulse__num">
                <HeadLabel long="vs PY start" short="± PY" />
              </th>
            </tr>
          </thead>
          <tbody>
            {shownRegions.map(r => (
              <tr key={r.region}>
                <th scope="row">
                  {/^\d+$/.test(r.region) ? (
                    <Link to={`/region/${r.region}`}>
                      {regionLabel(r.region)}
                    </Link>
                  ) : (
                    regionLabel(r.region)
                  )}
                </th>
                <td className="world-pulse__num">{fmt(r.districts)}</td>
                <td className="world-pulse__num">{fmt(r.paidClubs)}</td>
                <td className="world-pulse__num">{signed(r.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!reserve && regions.length > TOP_REGION_ROWS && (
          <Link to="/regions" className="world-pulse__more">
            All {regions.length} regions <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </section>
  )
}
