/**
 * PY-end snapshot-date selection — the ONE rule (#1435, epic #1426).
 *
 * `scripts/validate-vs-ceo-report.ts` has always picked each program year's
 * year-end snapshot the same way: the LAST snapshot directory whose own date
 * falls inside that program year. The CI job added by #1435 has to apply that
 * same rule to a `gsutil ls` listing *before* anything is synced, so the rule
 * moved here and the runner imports it. There is deliberately no second copy
 * — two selection rules that disagree is the defect this epic keeps
 * rediscovering.
 *
 * Two traps this file exists to keep out:
 *
 * 1. **Never hardcode `YYYY-06-30`.** The archived PY-end date is not
 *    reliably June 30 — a month-end closing period can push the settled
 *    snapshot into a differently dated directory. The rule is "last date in
 *    the program year", resolved from the actual listing.
 * 2. **Select by the snapshot's OWN date, never by `metadata.sourceCsvDate`.**
 *    The June-30 freeze is published ~3 weeks later, so its source date falls
 *    in July and a program-year-equality guard on it drops every completed
 *    year (Lesson 139).
 *
 * Purity: the exported functions do no I/O. The CLI at the bottom reads a
 * listing on stdin and writes JSON to stdout (logs go to stderr — R4), which
 * is how `.github/workflows/validate-vs-ceo-report.yml` reaches the rule:
 *
 *   gsutil ls "gs://$BUCKET/snapshots/" |
 *     npx tsx scripts/lib/ceoReportSnapshotDates.ts
 */

import { readFileSync } from 'node:fs'
import { CEO_REPORT_FIGURES } from './ceoReportOracle.js'

/** A snapshot directory name — `YYYY-MM-DD`, nothing else. */
export const SNAPSHOT_DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Program year ("YYYY-YYYY") a snapshot DATE belongs to. Calendar-pure and
 * deliberately so: the snapshot's directory date is the collection date, so
 * July 1 starts the new program year. Never call this on
 * `metadata.sourceCsvDate` — see trap 2 in the file header.
 */
export function programYearForSnapshotDate(date: string): string {
  const year = Number.parseInt(date.slice(0, 4), 10)
  const month = Number.parseInt(date.slice(5, 7), 10)
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/**
 * The last snapshot belonging to a program year — its year-end freeze.
 *
 * Selection is by the snapshot's own date, NOT by `sourceCsvDate`, and NOT by
 * a hardcoded June 30.
 */
export function selectYearEndSnapshot(
  dates: string[],
  programYear: string
): string | undefined {
  const inYear = dates
    .filter(date => programYearForSnapshotDate(date) === programYear)
    .sort()
  return inYear[inYear.length - 1]
}

/**
 * Snapshot dates in a `gsutil ls gs://<bucket>/snapshots/` listing, sorted and
 * de-duplicated. Anything that is not a dated prefix — the bucket root, an
 * `analytics/` sibling, a file inside a dated prefix — is ignored. Bare
 * `YYYY-MM-DD` lines are accepted so the rule can be driven from a plain list.
 */
export function parseSnapshotDateListing(text: string): string[] {
  const dates = new Set<string>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    // The date must be the LAST path segment: `…/2024-06-30/` is a snapshot
    // prefix, `…/2024-06-30/all-districts-rankings.json` is a file in one.
    const match = /(?:^|\/)(\d{4}-\d{2}-\d{2})\/?$/.exec(line)
    if (match?.[1]) dates.add(match[1])
  }
  return [...dates].sort()
}

/** One CEO Report program year and the snapshot chosen for it, if any. */
export interface CeoReportYearSelection {
  readonly programYear: string
  /** Absent — never substituted — when the year has no snapshot at all. */
  readonly snapshotDate?: string
}

/**
 * Resolve every program year the CEO Report publishes against a set of
 * available snapshot dates, in report order. A year with no snapshot comes
 * back without a date so the caller reports `noData` (the comparator models
 * it) instead of a scoring mismatch.
 */
export function resolveCeoReportSnapshotDates(
  dates: string[]
): CeoReportYearSelection[] {
  return CEO_REPORT_FIGURES.map(figures => {
    const snapshotDate = selectYearEndSnapshot(dates, figures.programYear)
    return snapshotDate
      ? { programYear: figures.programYear, snapshotDate }
      : { programYear: figures.programYear }
  })
}

/**
 * The coverage census: which published program years have a usable PY-end
 * snapshot and which do not, named explicitly. `noData` is the same word the
 * comparator uses for an absent year.
 */
export function formatCoverageCensus(
  selections: readonly CeoReportYearSelection[]
): string {
  const lines = [
    'Program year | PY-end snapshot',
    '------------ | ---------------',
  ]
  for (const selection of selections) {
    lines.push(
      `${selection.programYear}    | ${selection.snapshotDate ?? 'noData'}`
    )
  }
  const present = selections.filter(s => s.snapshotDate !== undefined)
  const absent = selections.filter(s => s.snapshotDate === undefined)
  lines.push('')
  lines.push(
    `Present (${present.length}/${selections.length}): ` +
      (present.map(s => s.programYear).join(', ') || 'none')
  )
  lines.push(
    `Absent (noData): ` + (absent.map(s => s.programYear).join(', ') || 'none')
  )
  return lines.join('\n')
}

/**
 * CLI: listing on stdin → `{ dates, selections }` JSON on stdout, census on
 * stderr. Exits 1 when the listing resolves NO program year at all — an empty
 * or unreachable bucket must fail the job loudly, not sync nothing quietly.
 */
function main(): void {
  const listing = readFileSync(0, 'utf-8')
  const selections = resolveCeoReportSnapshotDates(
    parseSnapshotDateListing(listing)
  )
  const dates = selections
    .map(selection => selection.snapshotDate)
    .filter((date): date is string => date !== undefined)

  process.stderr.write(`${formatCoverageCensus(selections)}\n`)
  process.stdout.write(`${JSON.stringify({ dates, selections }, null, 2)}\n`)
  process.exit(dates.length === 0 ? 1 : 0)
}

// Only when run directly (`npx tsx scripts/lib/ceoReportSnapshotDates.ts`).
// Under vitest argv[1] is the vitest binary, so importing this module never
// blocks on stdin.
if (process.argv[1]?.endsWith('ceoReportSnapshotDates.ts')) {
  main()
}
