/**
 * EducationLedgerHistory — backfill the education ledger history from TI's
 * Educational Achievement Archive, keeping each award's Date (#1802, epic
 * #1781).
 *
 * Same endpoint as the PY-level archive backfill (#1146): one anonymous GET
 * per (program year, district) to `GetDistrictReport?tableID=a30b93f3-…&
 * district=<D>&year=<PY>`. The archive covers PY 2003-2004 onward for every
 * district, retired ones included; a district that did not exist that year
 * returns a 0-byte body. Where #1146 aggregates per (club, award) for the
 * year and drops Date, this keeps it per (club, award, yearMonth) in a
 * dedicated raw store, `raw-education-ledger/<PY>/district_<id>.json`
 * (shared contract: EducationLedgerHistoryFileSchema).
 *
 * District list per program year, from history rather than TI's dropdown
 * (which lists only today's districts):
 * - 2008-09 onward: that year's year-end districtsummary CSV
 *   (`dashboards.toastmasters.org/<PY>/export.aspx`, the same report our
 *   snapshots are built from);
 * - before 2008-09 the dashboard has no archive (the URL redirects to an
 *   error page), so the candidates are the 2008-09 list plus every number up
 *   to its maximum. A candidate that did not exist returns 0 bytes and is
 *   recorded `no-data`.
 *
 * Idempotent and resumable: an existing schema-valid file is never
 * re-fetched (unless `force`), so a re-run after a timeout continues where
 * the last one stopped. Writes go to the LOCAL cache only; the data-pipeline
 * `backfill-education-ledger` mode uploads them to staging.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import {
  EDUCATION_LEDGER_HISTORY_VERSION,
  EducationLedgerHistoryFileSchema,
  educationLedgerHistoryObjectPath,
  type EducationLedgerHistoryFile,
  type EducationLedgerMonthRecord,
} from '@taverns-red/shared-contracts'

import {
  isValidDistrictSummaryCsv,
  parseDistrictIdsFromSummaryCsv,
} from '../utils/programYearResolver.js'
import { validateDistrictId } from '../utils/validateDistrictId.js'
import type { DailyReportFetcher } from './DailyReportFetcher.js'
import { parseEducationLedgerByMonth } from './DailyReportParser.js'
import {
  EDUCATION_ARCHIVE_GUID,
  programYearEndDate,
} from './EducationArchiveBackfill.js'

/** First program year in the archive's own year list (probed 2026-10-12). */
export const EARLIEST_LEDGER_PROGRAM_YEAR = '2003-2004'

/** First program year the dashboard serves a districtsummary for (probed 2026-10-12). */
export const EARLIEST_DISTRICTSUMMARY_PROGRAM_YEAR = '2008-2009'

const DASHBOARD_ORIGIN = 'https://dashboards.toastmasters.org'

/** The CSV downloader's user agent (HttpCsvDownloader). */
export const DISTRICTSUMMARY_USER_AGENT =
  'ToastStats-Backfill/1.0 (data collection for analytics)'

const startYearOf = (programYear: string): number =>
  Number(programYear.slice(0, 4))

/** Validates the format (consecutive years) and the archive's lower bound. */
function assertLedgerProgramYear(programYear: string): void {
  programYearEndDate(programYear)
  if (startYearOf(programYear) < startYearOf(EARLIEST_LEDGER_PROGRAM_YEAR)) {
    throw new Error(
      `Program year ${programYear} predates the archive (earliest ${EARLIEST_LEDGER_PROGRAM_YEAR})`
    )
  }
}

/** Local cache path mirroring the staging object path. */
export function ledgerHistoryFilePath(
  cacheDir: string,
  programYear: string,
  districtId: string
): string {
  // Active tripwire: validate before the id reaches a path.
  validateDistrictId(districtId)
  return path.join(
    cacheDir,
    educationLedgerHistoryObjectPath(programYear, districtId)
  )
}

interface LedgerStats {
  records: number
  achievements: number
  /** Achievements dated outside the program year (July → June). */
  outOfWindowAchievements: number
  /** Distinct award codes tagged `Other` (unmapped vocabulary to review). */
  otherAwardCodes: string[]
}

function ledgerStats(
  records: EducationLedgerMonthRecord[],
  programYear: string
): LedgerStats {
  const start = startYearOf(programYear)
  const from = `${start}-07`
  const to = `${start + 1}-06`
  let achievements = 0
  let outOfWindowAchievements = 0
  const other = new Set<string>()
  for (const r of records) {
    achievements += r.achievementCount
    if (r.yearMonth < from || r.yearMonth > to) {
      outOfWindowAchievements += r.achievementCount
    }
    if (r.program === 'Other') other.add(r.awardCode)
  }
  return {
    records: records.length,
    achievements,
    outOfWindowAchievements,
    otherAwardCodes: [...other].sort(),
  }
}

async function readExisting(
  filePath: string
): Promise<EducationLedgerHistoryFile | null> {
  const raw = await fs.readFile(filePath, 'utf-8').catch(() => null)
  if (raw === null) return null
  try {
    const parsed = EducationLedgerHistoryFileSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {
    // Unparseable JSON: fall through.
  }
  console.error(
    `[WARN] ${filePath} exists but fails the ledger-history schema; re-fetching`
  )
  return null
}

export interface EducationLedgerHistoryOptions {
  cacheDir: string
  districtId: string
  programYear: string
  fetcher: DailyReportFetcher
  /** Re-fetch even when a valid file exists. */
  force?: boolean
  /** Fetch and parse, write nothing. */
  dryRun?: boolean
  /** ISO timestamp stamped on the file. Defaults to now. */
  fetchedAt?: string
  /** Called right before the network request (rate spacing). */
  beforeFetch?: () => Promise<void>
}

export interface EducationLedgerHistoryResult extends LedgerStats {
  districtId: string
  programYear: string
  action: 'written' | 'no-data' | 'skipped-existing' | 'dry-run'
  /** Whether a request was made. */
  fetched: boolean
  /** Absolute path written ('written' / 'no-data' only). */
  path?: string
}

/**
 * Fetch → parse → write one (program year, district) ledger file.
 * A persistent fetch failure or an unparseable body throws and writes
 * nothing: a backfill must not record a silent gap.
 */
export async function backfillEducationLedgerHistory(
  options: EducationLedgerHistoryOptions
): Promise<EducationLedgerHistoryResult> {
  const { cacheDir, districtId, programYear, fetcher } = options
  assertLedgerProgramYear(programYear)
  const filePath = ledgerHistoryFilePath(cacheDir, programYear, districtId)
  const base = { districtId, programYear }

  if (!options.force) {
    const existing = await readExisting(filePath)
    if (existing) {
      return {
        ...base,
        ...ledgerStats(existing.records, programYear),
        action: 'skipped-existing',
        fetched: false,
      }
    }
  }

  await options.beforeFetch?.()
  const raw = await fetcher.fetchReport(
    EDUCATION_ARCHIVE_GUID,
    districtId,
    programYear
  )
  if (raw === null) {
    throw new Error(
      `Archive fetch failed for district ${districtId} PY ${programYear} after retries`
    )
  }
  const parsed = parseEducationLedgerByMonth(raw.html)
  const stats = ledgerStats(parsed.records, programYear)

  if (options.dryRun) {
    return { ...base, ...stats, action: 'dry-run', fetched: true }
  }

  const file = EducationLedgerHistoryFileSchema.parse({
    schemaVersion: EDUCATION_LEDGER_HISTORY_VERSION,
    districtId,
    programYear,
    fetchedAt: options.fetchedAt ?? new Date().toISOString(),
    source: {
      reportType: 'education-archive',
      tableId: EDUCATION_ARCHIVE_GUID,
    },
    status: parsed.empty ? 'no-data' : 'ok',
    records: parsed.records,
  } satisfies EducationLedgerHistoryFile)

  // Write-then-rename: a killed run never leaves a torn file that a resume
  // would read as done (a torn one fails the schema and is re-fetched anyway).
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}`
  await fs.writeFile(tmp, JSON.stringify(file), 'utf-8')
  await fs.rename(tmp, filePath)

  return {
    ...base,
    ...stats,
    action: parsed.empty ? 'no-data' : 'written',
    fetched: true,
    path: filePath,
  }
}

// ─── District list per program year ─────────────────────────────────────────

/**
 * The year-end districtsummary for a past program year. The month-end slot
 * is set and the as-of slot left empty: that form returns the year's final
 * list (probed 2008-09, 2013-14, 2018-19). Filling the as-of with 6/30
 * returned a header with zero rows for 2008-09.
 */
export function buildYearEndDistrictSummaryUrl(programYear: string): string {
  const endYear = programYearEndDate(programYear).slice(0, 4)
  return `${DASHBOARD_ORIGIN}/${programYear}/export.aspx?type=CSV&report=districtsummary~6/30/${endYear}~~${programYear}`
}

export type DistrictSource = 'explicit' | 'districtsummary' | 'candidate-range'

export interface LedgerDistricts {
  districts: string[]
  source: Exclude<DistrictSource, 'explicit'>
}

async function districtsFromSummary(
  programYear: string,
  fetchSummaryCsv: (programYear: string) => Promise<string | null>
): Promise<string[]> {
  const csv = await fetchSummaryCsv(programYear)
  const ids = isValidDistrictSummaryCsv(csv)
    ? parseDistrictIdsFromSummaryCsv(csv)
    : []
  if (ids.length === 0) {
    throw new Error(
      `No valid districtsummary for ${programYear} — refusing to guess its district list`
    )
  }
  return ids
}

/** Resolve which districts to fetch for one program year (see module doc). */
export async function resolveLedgerDistricts(
  programYear: string,
  fetchSummaryCsv: (programYear: string) => Promise<string | null>
): Promise<LedgerDistricts> {
  assertLedgerProgramYear(programYear)
  if (
    startYearOf(programYear) >=
    startYearOf(EARLIEST_DISTRICTSUMMARY_PROGRAM_YEAR)
  ) {
    return {
      districts: await districtsFromSummary(programYear, fetchSummaryCsv),
      source: 'districtsummary',
    }
  }

  const known = await districtsFromSummary(
    EARLIEST_DISTRICTSUMMARY_PROGRAM_YEAR,
    fetchSummaryCsv
  )
  const numeric = known.filter(id => /^\d+$/.test(id)).map(Number)
  const max = Math.max(...numeric)
  const range = Array.from({ length: max }, (_, i) =>
    String(i + 1).padStart(2, '0')
  )
  const lettered = known.filter(id => !/^\d+$/.test(id)).sort()
  return { districts: [...range, ...lettered], source: 'candidate-range' }
}

// ─── The run ────────────────────────────────────────────────────────────────

export interface RunEducationLedgerHistoryOptions {
  cacheDir: string
  programYears: string[]
  /** Explicit districts for every PY; omitted → resolved per PY. */
  districts?: string[]
  fetcher: DailyReportFetcher
  fetchSummaryCsv: (programYear: string) => Promise<string | null>
  /** Minimum ms between ANY two requests (archive or districtsummary). */
  rateMs: number
  sleep: (ms: number) => Promise<void>
  force?: boolean
  dryRun?: boolean
  fetchedAt?: string
  /** stderr progress lines (R4); omitted → silent. */
  log?: (line: string) => void
}

export interface ProgramYearSummary {
  programYear: string
  districtSource?: DistrictSource
  candidates: number
  written: number
  noData: number
  skippedExisting: number
  dryRun: number
  failed: number
  achievements: number
  outOfWindowAchievements: number
  otherAwardCodes: string[]
  /** Set when the PY's district list could not be resolved. */
  error?: string
}

export interface PairResult {
  programYear: string
  districtId: string
  ok: boolean
  action?: EducationLedgerHistoryResult['action']
  records?: number
  achievements?: number
  error?: string
}

export interface RunEducationLedgerHistorySummary {
  dryRun: boolean
  force: boolean
  totalPairs: number
  succeeded: number
  /** Failed pairs plus program years whose district list failed. */
  failed: number
  /** Network requests made (archive + districtsummary). */
  requests: number
  programYears: ProgramYearSummary[]
  results: PairResult[]
}

export async function runEducationLedgerHistoryBackfill(
  options: RunEducationLedgerHistoryOptions
): Promise<RunEducationLedgerHistorySummary> {
  const log = options.log ?? (() => {})
  let requests = 0
  const beforeRequest = async (): Promise<void> => {
    if (requests > 0 && options.rateMs > 0) await options.sleep(options.rateMs)
    requests += 1
  }
  const summaryCache = new Map<string, Promise<string | null>>()
  const fetchSummaryCsv = (programYear: string): Promise<string | null> => {
    let cached = summaryCache.get(programYear)
    if (!cached) {
      cached = beforeRequest().then(() => options.fetchSummaryCsv(programYear))
      summaryCache.set(programYear, cached)
    }
    return cached
  }

  const programYears: ProgramYearSummary[] = []
  const results: PairResult[] = []
  let pyFailures = 0

  for (const programYear of options.programYears) {
    const py: ProgramYearSummary = {
      programYear,
      candidates: 0,
      written: 0,
      noData: 0,
      skippedExisting: 0,
      dryRun: 0,
      failed: 0,
      achievements: 0,
      outOfWindowAchievements: 0,
      otherAwardCodes: [],
    }
    programYears.push(py)

    let districts: string[]
    try {
      if (options.districts && options.districts.length > 0) {
        assertLedgerProgramYear(programYear)
        districts = options.districts
        py.districtSource = 'explicit'
      } else {
        const resolved = await resolveLedgerDistricts(
          programYear,
          fetchSummaryCsv
        )
        districts = resolved.districts
        py.districtSource = resolved.source
      }
    } catch (err) {
      py.error = err instanceof Error ? err.message : String(err)
      pyFailures += 1
      log(`[ERROR] ${programYear}: ${py.error}`)
      continue
    }
    py.candidates = districts.length
    log(
      `[INFO] ${programYear}: ${districts.length} districts (${py.districtSource})`
    )

    const other = new Set<string>()
    for (const districtId of districts) {
      try {
        const r = await backfillEducationLedgerHistory({
          cacheDir: options.cacheDir,
          districtId,
          programYear,
          fetcher: options.fetcher,
          force: options.force,
          dryRun: options.dryRun,
          fetchedAt: options.fetchedAt,
          beforeFetch: beforeRequest,
        })
        if (r.action === 'written') py.written += 1
        else if (r.action === 'no-data') py.noData += 1
        else if (r.action === 'skipped-existing') py.skippedExisting += 1
        else py.dryRun += 1
        py.achievements += r.achievements
        py.outOfWindowAchievements += r.outOfWindowAchievements
        r.otherAwardCodes.forEach(c => other.add(c))
        results.push({
          programYear,
          districtId,
          ok: true,
          action: r.action,
          records: r.records,
          achievements: r.achievements,
        })
        log(
          `[INFO] D${districtId} ${programYear}: ${r.action} (${r.records} records, ${r.achievements} achievements)`
        )
      } catch (err) {
        // One failed pair never aborts the run; the summary and exit code carry it.
        const message = err instanceof Error ? err.message : String(err)
        py.failed += 1
        results.push({ programYear, districtId, ok: false, error: message })
        log(`[ERROR] D${districtId} ${programYear}: ${message}`)
      }
    }
    py.otherAwardCodes = [...other].sort()
  }

  const failedPairs = results.filter(r => !r.ok).length
  return {
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
    totalPairs: results.length,
    succeeded: results.length - failedPairs,
    failed: failedPairs + pyFailures,
    requests,
    programYears,
    results,
  }
}

/** Fetch a year-end districtsummary CSV over plain HTTP (null on non-2xx). */
export async function fetchYearEndDistrictSummary(
  programYear: string,
  fetchImpl: (
    url: string,
    init?: Record<string, unknown>
  ) => Promise<{ ok: boolean; text(): Promise<string> }> = globalThis.fetch
): Promise<string | null> {
  const res = await fetchImpl(buildYearEndDistrictSummaryUrl(programYear), {
    headers: { 'User-Agent': DISTRICTSUMMARY_USER_AGENT },
  })
  return res.ok ? res.text() : null
}
