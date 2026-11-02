/* Region and world What Changed (#2476, phase 1): the district-grain diff of
   two dates' `snapshots/<date>/all-districts-rankings.json` files.

   Pure. The page owns the date pair and region (R3) and passes the two
   dates' rows plus a region resolver per date: a district counts toward the
   region it belonged to on THAT date, so a realigned district leaves one
   region's "from" sum and joins another's "to" sum. Each date's totals sum
   the rows present on that date; a district on only one date keeps its row
   with no delta (`presence` says which side it is on). */
import type { CdnRankingsData } from '../services/cdn'
import { computeTiedRanks } from './tieRankingUtils'

type WireRow = CdnRankingsData['rankings'][number]

/** The rankings fields the diff reads. */
export type RankingsDiffRow = Pick<
  WireRow,
  | 'districtId'
  | 'districtName'
  | 'region'
  | 'paidClubs'
  | 'totalPayments'
  | 'distinguishedClubs'
  | 'aggregateScore'
  | 'overallRank'
  | 'newCharteredClubs'
  | 'suspendedClubs'
>

export type RegionOf = (row: RankingsDiffRow) => string

export interface DiffOptions {
  regionOfFrom: RegionOf
  regionOfTo: RegionOf
  /** Two-digit region id; omitted = worldwide. */
  region?: string | undefined
}

export interface Pair {
  from: number
  to: number
  delta: number
}

/** A value on each side, null where the district has no row. */
export interface NullablePair {
  from: number | null
  to: number | null
  delta: number | null
}

/** Rank 1 is best; `move` is positive when the district climbed. */
export interface RankMove {
  from: number | null
  to: number | null
  move: number | null
}

export interface DistrictChange {
  districtId: string
  districtName: string
  /** The region on the `to` date, else the `from` date. */
  region: string
  presence: 'both' | 'from-only' | 'to-only'
  paidClubs: NullablePair
  payments: NullablePair
  distinguished: NullablePair
  overallRank: RankMove
  /** Rank by aggregate score within the scope (the region, or the world). */
  scopeRank: RankMove
}

export type NotableKind = 'suspended' | 'new-charter'

export interface NotableEvent {
  districtId: string
  districtName: string
  kind: NotableKind
  from: number
  to: number
  delta: number
}

export interface Totals {
  paidClubs: Pair
  payments: Pair
  distinguished: Pair
}

export interface RankingsDiff {
  totals: Totals
  districts: DistrictChange[]
  events: NotableEvent[]
}

const pair = (from: number, to: number): Pair => ({
  from,
  to,
  delta: to - from,
})

const nullablePair = (
  from: number | null | undefined,
  to: number | null | undefined
): NullablePair => {
  const f = from ?? null
  const t = to ?? null
  return { from: f, to: t, delta: f !== null && t !== null ? t - f : null }
}

const rankMove = (
  from: number | null | undefined,
  to: number | null | undefined
): RankMove => {
  const f = from ?? null
  const t = to ?? null
  return { from: f, to: t, move: f !== null && t !== null ? f - t : null }
}

function sumTotals(
  fromRows: readonly RankingsDiffRow[],
  toRows: readonly RankingsDiffRow[]
): Totals {
  const sum = (
    rows: readonly RankingsDiffRow[],
    f: (r: RankingsDiffRow) => number
  ) => rows.reduce((a, r) => a + (f(r) ?? 0), 0)
  return {
    paidClubs: pair(
      sum(fromRows, r => r.paidClubs),
      sum(toRows, r => r.paidClubs)
    ),
    payments: pair(
      sum(fromRows, r => r.totalPayments),
      sum(toRows, r => r.totalPayments)
    ),
    distinguished: pair(
      sum(fromRows, r => r.distinguishedClubs),
      sum(toRows, r => r.distinguishedClubs)
    ),
  }
}

/** Competition ranks (1, 1, 3) by aggregate score within `rows`. */
function scopeRanks(rows: readonly RankingsDiffRow[]): Map<string, number> {
  const sorted = [...rows].sort(
    (a, b) => (b.aggregateScore ?? 0) - (a.aggregateScore ?? 0)
  )
  const ranks = computeTiedRanks(sorted, r => r.aggregateScore ?? 0)
  return new Map(sorted.map((r, i) => [r.districtId, ranks[i]!.rank]))
}

/**
 * Whether a date's file collected `field` at all: absent everywhere, or a
 * census-wide 0, means not collected — unknown, never zero (#1757).
 */
function collected(
  rows: readonly RankingsDiffRow[],
  field: 'suspendedClubs' | 'newCharteredClubs'
): boolean {
  return rows.some(r => (r[field] ?? 0) > 0)
}

export function diffRankings(
  fromAll: readonly RankingsDiffRow[],
  toAll: readonly RankingsDiffRow[],
  { regionOfFrom, regionOfTo, region }: DiffOptions
): RankingsDiff {
  const fromRows = region
    ? fromAll.filter(r => regionOfFrom(r) === region)
    : [...fromAll]
  const toRows = region
    ? toAll.filter(r => regionOfTo(r) === region)
    : [...toAll]

  const fromById = new Map(fromRows.map(r => [r.districtId, r]))
  const toById = new Map(toRows.map(r => [r.districtId, r]))
  const fromRank = scopeRanks(fromRows)
  const toRank = scopeRanks(toRows)

  const ids = [...new Set([...fromById.keys(), ...toById.keys()])]
  const districts: DistrictChange[] = ids.map(id => {
    const f = fromById.get(id)
    const t = toById.get(id)
    const named = (t ?? f)!
    return {
      districtId: id,
      districtName: named.districtName,
      region: t ? regionOfTo(t) : regionOfFrom(f!),
      presence: f && t ? 'both' : f ? 'from-only' : 'to-only',
      paidClubs: nullablePair(f?.paidClubs, t?.paidClubs),
      payments: nullablePair(f?.totalPayments, t?.totalPayments),
      distinguished: nullablePair(f?.distinguishedClubs, t?.distinguishedClubs),
      overallRank: rankMove(f?.overallRank, t?.overallRank),
      scopeRank: rankMove(fromRank.get(id), toRank.get(id)),
    }
  })

  // Collection is a property of the whole file, not the scope.
  const fields = [
    ['suspended', 'suspendedClubs'],
    ['new-charter', 'newCharteredClubs'],
  ] as const
  const events: NotableEvent[] = []
  for (const id of ids) {
    const f = fromById.get(id)
    const t = toById.get(id)
    if (!f || !t) continue
    for (const [kind, field] of fields) {
      if (!collected(fromAll, field) || !collected(toAll, field)) continue
      const a = f[field]
      const b = t[field]
      if (a === undefined || b === undefined || a === b) continue
      events.push({
        districtId: id,
        districtName: t.districtName,
        kind,
        from: a,
        to: b,
        delta: b - a,
      })
    }
  }

  return { totals: sumTotals(fromRows, toRows), districts, events }
}

export interface RegionTotalsRow extends Totals {
  region: string
  /** Districts in the region on the `to` date (else the `from` date). */
  districtCount: number
}

/** The world's totals broken down by region, sorted by region id. */
export function regionTotals(
  fromAll: readonly RankingsDiffRow[],
  toAll: readonly RankingsDiffRow[],
  { regionOfFrom, regionOfTo }: Omit<DiffOptions, 'region'>
): RegionTotalsRow[] {
  const regions = new Set([
    ...fromAll.map(regionOfFrom),
    ...toAll.map(regionOfTo),
  ])
  return [...regions]
    .filter(r => r !== '')
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map(region => {
      const f = fromAll.filter(r => regionOfFrom(r) === region)
      const t = toAll.filter(r => regionOfTo(r) === region)
      return {
        region,
        districtCount: t.length > 0 ? t.length : f.length,
        ...sumTotals(f, t),
      }
    })
}

/** The `n` districts whose overall rank or payments moved most, largest
 *  first; districts with no move (or on one date only) are left out. */
export function biggestMovers(
  districts: readonly DistrictChange[],
  by: 'overallRank' | 'payments',
  n: number
): DistrictChange[] {
  const size = (c: DistrictChange) =>
    by === 'overallRank' ? c.overallRank.move : c.payments.delta
  return districts
    .filter(c => {
      const s = size(c)
      return s !== null && s !== 0
    })
    .sort((a, b) => Math.abs(size(b)!) - Math.abs(size(a)!))
    .slice(0, n)
}

/** Every date any district recorded in the per-district snapshot index —
 *  the index the district What Changed page reads (#2476 reconciliation). */
export function recordedDatesUnion(
  index: Readonly<Record<string, readonly string[]>>
): string[] {
  return [...new Set(Object.values(index).flat())].sort()
}
