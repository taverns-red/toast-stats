import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import type { SnapshotDate } from '../types/snapshotDate'
import { formatDisplayDate, formatShortDate } from './dateFormatting'

/**
 * A point What Changed can diff: a dated snapshot, or one month-end
 * reconciliation revision of it (#2475).
 *
 * The NEWEST revision of a month end is byte-identical to
 * `snapshots/<monthEnd>/`, so it stays the plain month-end point (no `asOf`,
 * so every existing URL and fetch path is unchanged). Only EARLIER revisions
 * are extra points, addressed `monthEnd@asOf`.
 */
export interface SnapshotPoint {
  date: SnapshotDate
  asOf?: string
}

export interface SnapshotPointSet {
  points: SnapshotPoint[]
  /** token -> display label (only for tokens that differ from the date) */
  labels: Record<string, string>
  /** token -> optgroup heading, only for month ends that have revisions */
  groups: Record<string, string>
  /** URL token that is another spelling of a listed token -> that token */
  aliases: Record<string, string>
}

/** The URL / list token of a point: `date`, or `date@asOf` for a revision. */
export function pointToken(point: SnapshotPoint): string {
  return point.asOf ? `${point.date}@${point.asOf}` : point.date
}

/** True when `date` (YYYY-MM-DD) is the last day of its month. */
export function isMonthEnd(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return d === new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Turn the district's dated snapshots plus the month-end revision index into
 * the points the What Changed picker offers.
 *
 * `index` is optional: with none (or one whose month end this district has no
 * snapshot for) the result is exactly the dated points, so outside
 * reconciliation nothing changes.
 */
export function buildSnapshotPoints(
  dates: readonly SnapshotDate[],
  index: ReconciliationRevisionIndex | null | undefined,
  districtId: string,
  _monthEndCollectionDate?: string | null
): SnapshotPointSet {
  const set: SnapshotPointSet = {
    points: [],
    labels: {},
    groups: {},
    aliases: {},
  }
  const latest = index?.revisions[index.revisions.length - 1]
  const applies = !!index && !!latest && dates.some(d => d === index.monthEnd)
  const earlier = applies
    ? index.revisions
        .slice(0, -1)
        .filter(r => r.successfulDistricts.includes(districtId))
    : []

  for (const date of dates) {
    if (!applies || date !== index.monthEnd) {
      set.points.push({ date })
      continue
    }
    const heading = `${formatDisplayDate(date)} revisions`
    for (const r of earlier) {
      const point = { date, asOf: r.asOf }
      const token = pointToken(point)
      set.points.push(point)
      set.labels[token] =
        r.asOf === date
          ? `${formatDisplayDate(date)} · first view`
          : `${formatDisplayDate(date)} · revised ${formatShortDate(r.asOf)}`
      set.groups[token] = heading
    }
    set.points.push({ date })
    if (latest.closing) {
      set.labels[date] =
        `${formatDisplayDate(date)} · revised ${formatShortDate(latest.asOf)}`
    }
    if (earlier.length > 0) set.groups[date] = heading
    // The newest revision is the plain month end, spelled either way.
    set.aliases[pointToken({ date, asOf: latest.asOf })] = date
  }
  return set
}
