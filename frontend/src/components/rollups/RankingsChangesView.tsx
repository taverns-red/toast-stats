import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { KpiDeltaCard } from '../KpiDeltaCard'
import { ExportButton } from '../ExportButton'
import { exportRankingsDiff } from '../../utils/csvExport'
import { formatDisplayDate as fmtDate } from '../../utils/dateFormatting'
import {
  biggestMovers,
  diffRankings,
  regionTotals,
  type DistrictChange,
  type NotableEvent,
  type NullablePair,
  type Pair,
  type RankMove,
  type RankingsDiffRow,
  type RegionOf,
} from '../../utils/rankingsDiff'

/* RankingsChangesView (#2476, phase 1) — the body of `/region/:n/changes`
   and `/regions/changes`: what moved between two dates' all-districts
   rankings files, at district grain. The page owns the date pair, the
   region and the region resolvers (R3); this only renders the diff.

   Region: the three tiles summed over the region, a per-district table
   (deltas and the rank move within the region), and the districts whose
   suspended or new-charter count changed. World: the same tiles summed
   worldwide, a per-region breakdown, and the biggest movers by overall rank
   and by payments.

   Change words are plain visible text, not absolute sr-only spans: an
   absolute span inside the table scroller can escape it and widen the page
   (lesson: an absolute sr-only span escapes a scroller that is not its
   containing block). */

export interface RankingsChangesViewProps {
  /** "Region 05" or "All regions": the headline and the CSV name it. */
  scopeLabel: string
  /** Two-digit region id; omitted = the world view. */
  region?: string | undefined
  from: string
  to: string
  fromRows: readonly RankingsDiffRow[]
  toRows: readonly RankingsDiffRow[]
  regionOfFrom: RegionOf
  regionOfTo: RegionOf
}

const MOVERS = 5

function dayCount(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Signed count with a U+2212 minus, matching KpiDeltaCard's headline. */
function signed(n: number): string {
  const m = Math.abs(n).toLocaleString('en-US')
  return n > 0 ? `+${m}` : n < 0 ? `−${m}` : '0'
}

const num = (n: number) => n.toLocaleString('en-US')

const fromTo = (p: Pair) => `${num(p.from)} → ${num(p.to)}`

/** "104 (+4)"; a side with no row says on which date it is missing. */
function valueCell(p: NullablePair, from: string, to: string): string {
  if (p.to === null) return `Not on ${fmtDate(to)}`
  if (p.from === null) return `${num(p.to)} (new since ${fmtDate(from)})`
  return p.delta === 0 ? num(p.to) : `${num(p.to)} (${signed(p.delta!)})`
}

/** "1 → 2, down 1". Rank 1 is best, so a positive move is "up". */
function rankCell(r: RankMove): string {
  if (r.from === null || r.to === null) return r.to === null ? '—' : `${r.to}`
  const base = `${r.from} → ${r.to}`
  if (r.move === 0 || r.move === null) return base
  return `${base}, ${r.move > 0 ? 'up' : 'down'} ${Math.abs(r.move)}`
}

function eventLine(e: NotableEvent): string {
  const label = e.kind === 'suspended' ? 'suspended clubs' : 'new charters'
  return `${e.districtName}: ${label} ${num(e.from)} → ${num(e.to)} (${signed(e.delta)})`
}

/** A district's name as the rankings row gives it ("61" → "District 61"). */
function districtLabel(c: Pick<DistrictChange, 'districtName'>): string {
  return /^\d+$/.test(c.districtName)
    ? `District ${c.districtName}`
    : c.districtName
}

export const RankingsChangesView: React.FC<RankingsChangesViewProps> = ({
  scopeLabel,
  region,
  from,
  to,
  fromRows,
  toRows,
  regionOfFrom,
  regionOfTo,
}) => {
  const diff = useMemo(
    () => diffRankings(fromRows, toRows, { regionOfFrom, regionOfTo, region }),
    [fromRows, toRows, regionOfFrom, regionOfTo, region]
  )
  const regions = useMemo(
    () =>
      region
        ? []
        : regionTotals(fromRows, toRows, { regionOfFrom, regionOfTo }),
    [fromRows, toRows, regionOfFrom, regionOfTo, region]
  )
  // Table order: the in-scope rank on the `to` date, districts on only the
  // `from` date last.
  const districts = useMemo(
    () =>
      [...diff.districts].sort(
        (a, b) =>
          (a.scopeRank.to ?? Infinity) - (b.scopeRank.to ?? Infinity) ||
          (a.scopeRank.from ?? Infinity) - (b.scopeRank.from ?? Infinity)
      ),
    [diff.districts]
  )
  const days = dayCount(from, to)
  const pairQuery = `?from=${from}&to=${to}`

  return (
    <div className="rankings-changes" data-testid="rankings-changes">
      <div className="district-changes__headline-row">
        <p
          className="district-changes__headline"
          data-testid="changes-headline"
        >
          Changes for {scopeLabel} from {fmtDate(from)} to {fmtDate(to)}
          {days > 0 && ` · ${days} day${days === 1 ? '' : 's'}`}
        </p>
        {diff.districts.length > 0 && (
          <ExportButton
            onExport={() => exportRankingsDiff({ scopeLabel, from, to, diff })}
          />
        )}
      </div>

      {/* The tiles' titles are h3s; this h2 is their parent (#2650). */}
      <h2 className="sr-only">Totals</h2>
      <div className="district-changes__kpis rankings-changes__kpis">
        <KpiDeltaCard
          title="Paid clubs"
          current={diff.totals.paidClubs.delta}
          secondaryLabel={fromTo(diff.totals.paidClubs)}
        />
        <KpiDeltaCard
          title="Payments"
          current={diff.totals.payments.delta}
          secondaryLabel={fromTo(diff.totals.payments)}
        />
        <KpiDeltaCard
          title="Distinguished clubs"
          current={diff.totals.distinguished.delta}
          secondaryLabel={fromTo(diff.totals.distinguished)}
        />
      </div>

      {region ? (
        <>
          <section
            className="rankings-changes__section"
            aria-labelledby="rankings-changes-districts"
          >
            <h2
              id="rankings-changes-districts"
              className="rollup-section__title"
            >
              Districts
            </h2>
            <div
              className="rankings-changes__scroller"
              tabIndex={0}
              role="region"
              aria-label={`${scopeLabel} districts, scrollable`}
            >
              <table className="dt dt-static rankings-changes__table">
                <caption className="sr-only">{`${scopeLabel} districts`}</caption>
                <thead>
                  <tr>
                    <th scope="col">District</th>
                    <th scope="col">Paid clubs</th>
                    <th scope="col">Payments</th>
                    <th scope="col">Distinguished</th>
                    <th scope="col">Rank in region</th>
                    <th scope="col">Overall rank</th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map(c => (
                    <tr key={c.districtId}>
                      <th scope="row">
                        <Link
                          to={`/district/${c.districtId}/changes${pairQuery}`}
                        >
                          {districtLabel(c)}
                        </Link>
                      </th>
                      <td>{valueCell(c.paidClubs, from, to)}</td>
                      <td>{valueCell(c.payments, from, to)}</td>
                      <td>{valueCell(c.distinguished, from, to)}</td>
                      <td>{rankCell(c.scopeRank)}</td>
                      <td>{rankCell(c.overallRank)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            className="rankings-changes__section"
            aria-labelledby="rankings-changes-events"
          >
            <h2 id="rankings-changes-events" className="rollup-section__title">
              Notable events
            </h2>
            {diff.events.length === 0 ? (
              <p
                className="district-changes__empty"
                data-testid="changes-no-events"
              >
                No district’s suspended or new-charter count changed between
                these dates.
              </p>
            ) : (
              <ul
                className="rankings-changes__list"
                aria-label="Notable events"
              >
                {diff.events.map(e => (
                  <li key={`${e.districtId}-${e.kind}`}>{eventLine(e)}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <section
            className="rankings-changes__section"
            aria-labelledby="rankings-changes-regions"
          >
            <h2 id="rankings-changes-regions" className="rollup-section__title">
              By region
            </h2>
            <div
              className="rankings-changes__scroller"
              tabIndex={0}
              role="region"
              aria-label="Changes by region, scrollable"
            >
              <table className="dt dt-static rankings-changes__table">
                <caption className="sr-only">Changes by region</caption>
                <thead>
                  <tr>
                    <th scope="col">Region</th>
                    <th scope="col">Districts</th>
                    <th scope="col">Paid clubs</th>
                    <th scope="col">Payments</th>
                    <th scope="col">Distinguished</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map(r => (
                    <tr key={r.region}>
                      <th scope="row">
                        <Link to={`/region/${r.region}/changes${pairQuery}`}>
                          Region {r.region}
                        </Link>
                      </th>
                      <td>{num(r.districtCount)}</td>
                      <td>{valueCell(r.paidClubs, from, to)}</td>
                      <td>{valueCell(r.payments, from, to)}</td>
                      <td>{valueCell(r.distinguished, from, to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="rankings-changes__movers">
            <MoverList
              title="Biggest moves in overall rank"
              rows={biggestMovers(diff.districts, 'overallRank', MOVERS)}
              line={c => `Overall rank ${rankCell(c.overallRank)}`}
              pairQuery={pairQuery}
            />
            <MoverList
              title="Biggest payment changes"
              rows={biggestMovers(diff.districts, 'payments', MOVERS)}
              line={c =>
                `Payments ${num(c.payments.from!)} → ${num(c.payments.to!)} (${signed(c.payments.delta!)})`
              }
              pairQuery={pairQuery}
            />
          </div>
        </>
      )}
    </div>
  )
}

const MoverList: React.FC<{
  title: string
  rows: readonly DistrictChange[]
  line: (c: DistrictChange) => string
  pairQuery: string
}> = ({ title, rows, line, pairQuery }) => (
  <section className="rankings-changes__section">
    <h2 className="rollup-section__title">{title}</h2>
    {rows.length === 0 ? (
      <p className="district-changes__empty">No change between these dates.</p>
    ) : (
      <ol className="rankings-changes__list" aria-label={title}>
        {rows.map(c => (
          <li key={c.districtId}>
            <Link to={`/district/${c.districtId}/changes${pairQuery}`}>
              {districtLabel(c)}
            </Link>{' '}
            <span className="rankings-changes__meta">
              (Region {c.region}) · {line(c)}
            </span>
          </li>
        ))}
      </ol>
    )}
  </section>
)

export default RankingsChangesView
