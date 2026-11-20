/**
 * The one-off generator for `config/legacy-suspension-deadlines.json`
 * (#3103). Pure functions; `scripts/build-legacy-suspension-deadlines.ts`
 * does the I/O.
 *
 * TI's suspend date reaches our data only from 2025-07-31 (the suspended
 * lists). For a club suspended before that, the five-period rule takes the
 * deadline from status history (Ron, 2026-11-20): the Sep 30 or Mar 31
 * deadline on or before the first snapshot of the club's last run of Club
 * Status "Suspended". The month-end snapshot dated on a deadline is
 * collected a week or so later, so it can already show that deadline's
 * suspensions; "on or before" places those right.
 *
 * Only clubs whose last observation in the window is Suspended get a row:
 * a club seen in good standing after its run was reinstated, and if it was
 * suspended again later its TI date places it.
 *
 * The window is program year 2024-25 (2024-07-01 to 2025-06-30). An
 * earlier suspension is past period 5 for as long as the file matters
 * (until 2027-10-01), and TI drops the previous year's suspensions from the
 * roster at the July rollover, so earlier years add nothing.
 *
 * @module legacySuspensionDeadlines
 */

import { createHash } from 'node:crypto'
import {
  LEGACY_SUSPENSION_DEADLINES_EXPIRES,
  LEGACY_SUSPENSION_DEADLINES_FORMAT,
  normalizeClubId,
  type LegacySuspensionDeadlines,
} from '@taverns-red/shared-contracts'

/** One club's Club Status in one snapshot. */
export interface ClubObservation {
  date: string
  status: string | undefined
}

/** First and last snapshot dates the generator reads (program year 2024-25). */
export const LEGACY_SOURCE_FROM = '2024-07-01'
export const LEGACY_SOURCE_TO = '2025-06-30'

const isSuspended = (status: string | undefined): boolean =>
  (status ?? '').trim().toLowerCase() === 'suspended'

/** The Sep 30 or Mar 31 deadline on or before an ISO date. */
export function lastDeadlineOnOrBefore(date: string): string {
  const year = Number(date.slice(0, 4))
  const monthDay = date.slice(5)
  if (monthDay >= '09-30') return `${year}-09-30`
  if (monthDay >= '03-31') return `${year}-03-31`
  return `${year - 1}-09-30`
}

/**
 * Club number → suspension deadline, for every club whose last observation
 * is Suspended: the deadline on or before the first date of that last run.
 */
export function deriveSuspensionDeadlines(
  history: ReadonlyMap<string, readonly ClubObservation[]>
): Record<string, string> {
  const rows: Record<string, string> = {}
  const clubs = [...history.keys()].sort()
  for (const club of clubs) {
    const seen = [...history.get(club)!].sort((a, b) =>
      a.date.localeCompare(b.date)
    )
    if (seen.length === 0 || !isSuspended(seen.at(-1)!.status)) continue
    let start = seen.length - 1
    while (start > 0 && isSuspended(seen[start - 1]!.status)) start--
    rows[club] = lastDeadlineOnOrBefore(seen[start]!.date)
  }
  return rows
}

interface StoredClub {
  clubId?: unknown
  clubStatus?: unknown
}
interface StoredPerformanceRow {
  'Club Number'?: unknown
  'Club Status'?: unknown
}

/**
 * Club number and Club Status of every club in a stored district snapshot
 * (`snapshots/<date>/district_<id>.json`): `data.clubs[]`, or the raw
 * `data.clubPerformance[]` rows when a file has no normalized clubs.
 */
export function clubStatusesOf(
  snapshot: unknown
): Array<{ clubNumber: string; status: string | undefined }> {
  const data = (snapshot as { data?: Record<string, unknown> } | null)?.data
  if (!data) return []
  const text = (v: unknown): string | undefined =>
    typeof v === 'string' ? v : undefined
  const clubs = Array.isArray(data['clubs'])
    ? (data['clubs'] as StoredClub[])
    : []
  if (clubs.length > 0) {
    return clubs
      .filter(c => text(c.clubId))
      .map(c => ({
        clubNumber: normalizeClubId(text(c.clubId)!),
        status: text(c.clubStatus),
      }))
  }
  const rows = Array.isArray(data['clubPerformance'])
    ? (data['clubPerformance'] as StoredPerformanceRow[])
    : []
  return rows
    .filter(r => /^\s*\d+\s*$/.test(text(r['Club Number']) ?? ''))
    .map(r => ({
      clubNumber: normalizeClubId(text(r['Club Number'])!.trim()),
      status: text(r['Club Status']),
    }))
}

/** sha256 (hex) of the rows as JSON pairs sorted by club number. */
export function rowsSha256(rows: Record<string, string>): string {
  const pairs = Object.entries(rows).sort(([a], [b]) => (a < b ? -1 : 1))
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex')
}

export function buildLegacySuspensionDeadlines(input: {
  rows: Record<string, string>
  sourceDates: readonly string[]
  generatedAt: string
}): LegacySuspensionDeadlines {
  return {
    _format: LEGACY_SUSPENSION_DEADLINES_FORMAT,
    generatedAt: input.generatedAt,
    expires: LEGACY_SUSPENSION_DEADLINES_EXPIRES,
    sourceDates: [...input.sourceDates].sort(),
    rowCount: Object.keys(input.rows).length,
    rowsSha256: rowsSha256(input.rows),
    rows: input.rows,
  }
}

const LISTING_LINE =
  /^\s*(\d+)\s+\S+\s+(gs:\/\/[^/\s]+\/snapshots\/(\d{4}-\d{2}-\d{2})\/district_[0-9A-Za-z]+\.json)\s*$/

/**
 * The objects to read, from `gcloud storage ls -l` output: each
 * `district_<id>.json` (not the reports or other sidecars) dated inside the
 * window, with its stored size, which is what the download moves.
 */
export function planLegacySources(listing: string): {
  objects: Array<{ url: string; date: string; size: number }>
  count: number
  bytes: number
  dates: string[]
} {
  const objects: Array<{ url: string; date: string; size: number }> = []
  for (const line of listing.split('\n')) {
    const m = LISTING_LINE.exec(line)
    if (!m) continue
    const date = m[3]!
    if (date < LEGACY_SOURCE_FROM || date > LEGACY_SOURCE_TO) continue
    objects.push({ url: m[2]!, date, size: Number(m[1]) })
  }
  objects.sort((a, b) => a.url.localeCompare(b.url))
  return {
    objects,
    count: objects.length,
    bytes: objects.reduce((sum, o) => sum + o.size, 0),
    dates: [...new Set(objects.map(o => o.date))].sort(),
  }
}
