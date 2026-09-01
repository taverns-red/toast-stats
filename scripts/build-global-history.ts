/**
 * `v1/global-history.json` runner (#1499, epic #1496).
 *
 * Thin glue around `scripts/lib/globalHistory.ts`, which holds every rule and
 * is unit-tested against frozen fixtures. This file does I/O and exit codes.
 *
 * It runs in TWO passes, because the set of GCS objects the build needs is
 * itself derived from the dates listing:
 *
 *   # 1. which snapshot dates does the series need, and what for?
 *   npx tsx scripts/build-global-history.ts --plan --dates-file /tmp/all-dates.txt
 *   # -> "2026-06-30\tyear-end" / "2026-03-31\tmarch", one per line, on stdout
 *
 *   # 2. assemble from what the download actually produced
 *   npx tsx scripts/build-global-history.ts \
 *     --dates-file /tmp/all-dates.txt --source-dir /tmp/gh-src --out /tmp/global-history.json
 *
 * The workflow copies each planned date's `global-totals.json` into
 * `<source-dir>/<date>/`, plus — for the year-end dates only —
 * `all-districts-rankings.json` and the `district_*_reports.json` sidecars.
 * Use `gcloud storage cp` for those copies, never `gsutil cp -I`: the latter
 * silently truncates its stdin source list to two entries and exits 0, which
 * cost this project two wrong production indexes (#1469, and #1412's
 * gsutil→gcloud migration prefers gcloud for new code anyway).
 *
 * MISSING INPUT IS A ROW OMITTED, NOT A FAILED RUN. Unlike the per-date
 * `build-global-totals.ts`, whose sums go silently understated when a
 * district file half-arrives, every input here is a whole artifact: it is
 * either present and copied through, or absent and the year is dropped with a
 * loud `::warning::` naming the backfill dispatch that fixes it. This step
 * shares the pipeline's "Generate CDN manifests" job with `v1/latest.json`
 * and `v1/dates.json`; aborting it over one un-backfilled year would take
 * those down too.
 *
 * R4: logs to stderr; the artifact to the file; a one-line JSON summary to
 * stdout so a workflow can `| jq` it.
 *
 * Exit codes: 0 = written (possibly with omitted years) · 1 = assembly
 * failed · 2 = usage or setup error.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildGlobalHistory,
  selectProgramYearEnds,
  type GlobalHistoryReportsFile,
  type GlobalHistoryYearSource,
} from './lib/globalHistory.js'

/** `district_<id>_reports.json` — the `[A-Z0-9]+` guard keeps `\w`'s `_` out. */
const REPORTS_FILE = /^district_([A-Za-z0-9]+)_reports\.json$/

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function readDates(path: string): string[] {
  return readFileSync(path, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^\d{4}-\d{2}-\d{2}$/.test(line))
}

/** Parse a JSON file, or null when it is absent or unreadable. */
function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (error) {
    log(
      `::warning::could not parse ${path}: ` +
        (error instanceof Error ? error.message : 'unknown error')
    )
    return null
  }
}

/**
 * The district ids the date's own rankings list — the scope every sum runs
 * over. `null` when the file did not arrive, which the assembler treats as
 * "unknown scope" and refuses to sum education over (#1465/#1466).
 */
function readRankingsDistrictIds(dateDir: string): string[] | null {
  const parsed = readJson(join(dateDir, 'all-districts-rankings.json'))
  if (parsed === null || typeof parsed !== 'object') return null
  const rankings = (parsed as { rankings?: unknown }).rankings
  if (!Array.isArray(rankings)) return null
  return rankings
    .map(row =>
      typeof row === 'object' && row !== null
        ? (row as { districtId?: unknown }).districtId
        : undefined
    )
    .filter((id): id is string => typeof id === 'string')
}

/**
 * Every `district_*_reports.json` sidecar in the date's directory. `null` when
 * the directory holds none at all — the difference between "we have the
 * reports and they say nothing" and "we never fetched them", which is the
 * difference between `education: 0` and `education: null`.
 */
function readReports(dateDir: string): GlobalHistoryReportsFile[] | null {
  if (!existsSync(dateDir)) return null
  const files: GlobalHistoryReportsFile[] = []
  for (const name of readdirSync(dateDir).sort()) {
    const match = REPORTS_FILE.exec(name)
    if (!match?.[1]) continue
    const dataset = readJson(join(dateDir, name))
    if (dataset === null) continue
    files.push({ districtId: match[1], dataset })
  }
  return files.length === 0 ? null : files
}

function main(): void {
  const datesFile = readFlag('dates-file')
  const plan = process.argv.includes('--plan')
  const asOf = readFlag('as-of') ?? new Date().toISOString().slice(0, 10)

  if (!datesFile) {
    log(
      'Usage: build-global-history.ts --dates-file <file> ' +
        '[--plan | --source-dir <dir> --out <path>] [--as-of YYYY-MM-DD]'
    )
    process.exit(2)
  }
  if (!existsSync(datesFile)) {
    log(`dates file does not exist: ${datesFile}`)
    process.exit(2)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    log(`--as-of must be YYYY-MM-DD, got: ${asOf}`)
    process.exit(2)
  }

  const selections = selectProgramYearEnds(readDates(datesFile), asOf)

  if (plan) {
    // The March date is planned only when the listing actually has it; a
    // program year without one publishes `totalMembershipMarch31: null`.
    for (const selection of selections) {
      process.stdout.write(`${selection.yearEndDate}\tyear-end\n`)
      if (selection.marchDate)
        process.stdout.write(`${selection.marchDate}\tmarch\n`)
    }
    log(`planned ${selections.length} completed program year(s) as of ${asOf}`)
    process.exit(0)
  }

  const sourceDir = readFlag('source-dir')
  const outPath = readFlag('out')
  if (!sourceDir || !outPath) {
    log('--source-dir and --out are required unless --plan is given')
    process.exit(2)
  }
  if (!existsSync(sourceDir)) {
    log(`source directory does not exist: ${sourceDir}`)
    process.exit(2)
  }

  try {
    const sources: GlobalHistoryYearSource[] = selections.map(selection => {
      const yearEndDir = join(sourceDir, selection.yearEndDate)
      return {
        ...selection,
        yearEndTotals: readJson(join(yearEndDir, 'global-totals.json')),
        marchTotals: selection.marchDate
          ? readJson(join(sourceDir, selection.marchDate, 'global-totals.json'))
          : null,
        rankingsDistrictIds: readRankingsDistrictIds(yearEndDir),
        reports: readReports(yearEndDir),
      }
    })

    const { history, warnings } = buildGlobalHistory(
      sources,
      new Date().toISOString()
    )

    // Loud, not swallowed: an omitted year is a remediable backfill gap and
    // the operator has to be able to see which dispatch fixes it.
    for (const warning of warnings) log(`::warning::${warning}`)

    writeFileSync(outPath, JSON.stringify(history, null, 2) + '\n', 'utf-8')

    for (const year of history.years) {
      log(
        `${year.programYear} (${year.yearEndDate}): ` +
          `${year.membership.totalMembership} members June-30, ` +
          `${year.membership.totalMembershipMarch31 ?? 'no'} Mar-31, ` +
          `${year.membership.totalPayments} payments, ` +
          `education ${year.education ? year.education.total : 'null'}`
      )
    }

    process.stdout.write(
      JSON.stringify({
        path: outPath,
        years: history.years.length,
        omitted: history.omitted.length,
        programYears: history.years.map(y => y.programYear),
        educationYears: history.years
          .filter(y => y.education !== null)
          .map(y => y.programYear),
      }) + '\n'
    )
    process.exit(0)
  } catch (error) {
    log(
      '::error::failed to build v1/global-history.json: ' +
        (error instanceof Error ? error.message : 'unknown error')
    )
    process.exit(1)
  }
}

main()
