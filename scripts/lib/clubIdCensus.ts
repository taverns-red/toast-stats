/**
 * Club-id census — is any real Toastmasters club id non-numeric? (#1450)
 *
 * `normalizeClubId` (`packages/shared-contracts/src/naming/clubId.ts`) reduces
 * a club id to a canonical key, and #1440 made the pipeline store that
 * canonical form at WRITE time — so the keys of the published
 * `config/club-index.json` are canonical ids. If two distinct clubs ever
 * canonicalize to the same key, they occupy one entry in a public artifact
 * and the later write wins, silently (the Lesson 47 signature).
 *
 * Nobody has checked whether that can happen, because nobody has looked at a
 * club id that is not a fixture. CDN egress is blocked from every desk and
 * agent session; CI is the only place the archive is reachable. So this census
 * rides along in `.github/workflows/validate-vs-ceo-report.yml`, which already
 * syncs five program-year-end snapshot sets, and reads what is already on disk.
 *
 * Two questions, deliberately separate:
 *
 * 1. **Non-digit scan** — which club ids contain a character that is not a
 *    digit, printed VERBATIM. Rule-independent: it is a fact about the data,
 *    and it is what settles #1450. `'180` and `Club 180` are known CSV import
 *    debris that `FindAClubMerger` has tolerated since #429 — harmless. A bare
 *    `A12` is genuine alphanumeric identity — the live bug. Only the actual
 *    strings tell the two apart, which is why a count is not an answer.
 * 2. **Collision grouping** — do two DISTINCT raw ids canonicalize onto one
 *    key? This is the collision the issue is actually about, and it is
 *    directly computable. It moves with the shipped rule by construction: the
 *    normalizer is `normalizeClubId` itself, not a copy, so what this reports
 *    is what the pipeline would write.
 *
 *    A group whose members differ ONLY in leading zeros (`0012` / `12`) is the
 *    same club in two lexical forms — exactly what normalization exists to
 *    reconcile — so it is reported as benign and kept out of the finding
 *    count. Anything else is `substantive` and is the signal.
 *
 * This census never decides whether the RUN is red. The oracle's exit code
 * owns that (0 reproduced / 1 findings / 2 setup error), and a club-id finding
 * is a different question from a CEO-report mismatch; conflating them would
 * make one unreadable through the other. Findings are reported loudly — job
 * summary and issue comment — and the CLI still exits 0.
 *
 * Purity: every exported function is pure. The CLI at the bottom does the
 * reading, writes JSON to stdout and the human report to stderr (R4).
 *
 *   npx tsx scripts/lib/clubIdCensus.ts --cache-dir ./cache
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeClubId } from '@taverns-red/shared-contracts'
import {
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
} from './snapshotFileNames.js'
import {
  programYearForSnapshotDate,
  SNAPSHOT_DATE_DIR_PATTERN,
} from './ceoReportSnapshotDates.js'

/** Where in a district snapshot an id was read from. */
export type ClubIdSource = 'clubPerformance' | 'clubs'

/** One club id exactly as it appears in one district snapshot. */
export interface ClubIdOccurrence {
  /** The id verbatim — trimmed only. Never normalized. */
  readonly rawId: string
  readonly districtId: string
  readonly source: ClubIdSource
  readonly clubName?: string
}

/** One distinct raw id that contains at least one non-digit character. */
export interface NonDigitClubId {
  readonly rawId: string
  readonly count: number
  readonly districts: readonly string[]
  readonly sources: readonly ClubIdSource[]
}

/** Two or more distinct raw ids that canonicalize onto one key. */
export interface CanonicalCollision {
  readonly canonical: string
  readonly rawIds: readonly string[]
  readonly districts: readonly string[]
  readonly clubNames: readonly string[]
  /**
   * False when the members differ only in leading zeros — the same club in
   * two lexical forms. True is the data-integrity finding.
   */
  readonly substantive: boolean
}

export interface ClubIdCensus {
  readonly totalIds: number
  readonly distinctRawIds: number
  readonly nonDigit: readonly NonDigitClubId[]
  /** Substantive collisions first, then benign padding-only ones. */
  readonly collisions: readonly CanonicalCollision[]
}

/** One snapshot's census, labelled with the program year it closes. */
export interface ProgramYearCensus {
  readonly programYear: string
  readonly snapshotDate: string
  readonly districtFiles: number
  readonly census: ClubIdCensus
}

/**
 * Codepoint order, never locale order. `Intl` collation varies with the
 * runner's ICU data, and a report whose sample changes between machines is a
 * report nobody can diff (the `lessons-index` locale trap).
 */
function byCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(byCodepoint)
}

/** A cell that carries a usable id: a non-blank string or a number. */
function readCell(
  record: Record<string, unknown>,
  ...columns: string[]
): string | undefined {
  for (const column of columns) {
    const value = record[column]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed !== '') return trimmed
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

/**
 * Every club id in one per-district snapshot file.
 *
 * The file name decides whether this is a district snapshot at all — the
 * shared matcher (#1428) owns that, so the daily-reports sidecar
 * `district_61_reports.json` (and any future `district_61_foo.json`) is
 * excluded here for the same reason the oracle excludes it, from the same
 * regex. A `status: 'failed'` file carries no data and contributes nothing.
 *
 * Both id-bearing shapes are read, because they answer different halves:
 * `clubPerformance` rows are the raw CSV records, persisted verbatim on every
 * snapshot and therefore comparable across all five program years (Lesson
 * 123); `clubs[].clubId` is the transformed field whose value becomes a key of
 * `config/club-index.json`.
 */
export function collectClubIdOccurrences(
  fileName: string,
  parsed: unknown
): ClubIdOccurrence[] {
  if (!isDistrictSnapshotFile(fileName)) return []
  const districtId = districtIdFromSnapshotFileName(fileName)
  if (districtId === null) return []
  if (!isRecord(parsed)) return []
  if (parsed['status'] === 'failed') return []

  const data = isRecord(parsed['data']) ? parsed['data'] : undefined
  if (!data) return []

  const occurrences: ClubIdOccurrence[] = []

  for (const record of asRecordArray(data['clubPerformance'])) {
    // The same column preference DataTransformer uses to build `clubs[]`. A
    // narrower list would let a non-digit id hide in an alternate column and
    // be reported as "none found".
    const rawId = readCell(record, 'Club Number', 'ClubId', 'Club')
    if (rawId === undefined) continue
    const clubName = readCell(record, 'Club Name', 'ClubName', 'Name')
    occurrences.push({
      rawId,
      districtId,
      source: 'clubPerformance',
      ...(clubName === undefined ? {} : { clubName }),
    })
  }

  for (const record of asRecordArray(data['clubs'])) {
    const rawId = readCell(record, 'clubId')
    if (rawId === undefined) continue
    const clubName = readCell(record, 'clubName')
    occurrences.push({
      rawId,
      districtId,
      source: 'clubs',
      ...(clubName === undefined ? {} : { clubName }),
    })
  }

  return occurrences
}

/** Leading zeros only — the difference that does NOT make two ids distinct. */
function stripLeadingZeros(id: string): string {
  const stripped = id.replace(/^0+/, '')
  return stripped === '' ? id : stripped
}

export interface CensusOptions {
  /**
   * The canonicalization under test. Defaults to the SHIPPED
   * `normalizeClubId`, so the collisions reported are the collisions the
   * pipeline would write. Injectable because the shipped rule is in flux
   * (#1437 and #1440 shipped opposing rules) and the grouping logic must be
   * testable independently of which one is on `main`.
   */
  readonly normalize?: (rawId: string) => string
}

/** Aggregate raw occurrences into the two findings. */
export function buildClubIdCensus(
  occurrences: Iterable<ClubIdOccurrence>,
  options: CensusOptions = {}
): ClubIdCensus {
  const normalize = options.normalize ?? normalizeClubId

  let totalIds = 0
  const byRawId = new Map<
    string,
    { count: number; districts: Set<string>; sources: Set<ClubIdSource> }
  >()
  const byCanonical = new Map<
    string,
    { rawIds: Set<string>; districts: Set<string>; clubNames: Set<string> }
  >()

  for (const occurrence of occurrences) {
    totalIds++

    const raw = byRawId.get(occurrence.rawId) ?? {
      count: 0,
      districts: new Set<string>(),
      sources: new Set<ClubIdSource>(),
    }
    raw.count++
    raw.districts.add(occurrence.districtId)
    raw.sources.add(occurrence.source)
    byRawId.set(occurrence.rawId, raw)

    const canonical = normalize(occurrence.rawId)
    const group = byCanonical.get(canonical) ?? {
      rawIds: new Set<string>(),
      districts: new Set<string>(),
      clubNames: new Set<string>(),
    }
    group.rawIds.add(occurrence.rawId)
    group.districts.add(occurrence.districtId)
    if (occurrence.clubName !== undefined)
      group.clubNames.add(occurrence.clubName)
    byCanonical.set(canonical, group)
  }

  const nonDigit: NonDigitClubId[] = [...byRawId.entries()]
    .filter(([rawId]) => /\D/.test(rawId))
    .map(([rawId, seen]) => ({
      rawId,
      count: seen.count,
      districts: sortedUnique(seen.districts),
      sources: [...seen.sources].sort(byCodepoint) as ClubIdSource[],
    }))
    .sort((a, b) => byCodepoint(a.rawId, b.rawId))

  const collisions: CanonicalCollision[] = [...byCanonical.entries()]
    .filter(([, group]) => group.rawIds.size > 1)
    .map(([canonical, group]) => {
      const rawIds = sortedUnique(group.rawIds)
      const beyondPadding = new Set(rawIds.map(stripLeadingZeros))
      return {
        canonical,
        rawIds,
        districts: sortedUnique(group.districts),
        clubNames: sortedUnique(group.clubNames),
        substantive: beyondPadding.size > 1,
      }
    })
    .sort((a, b) => {
      if (a.substantive !== b.substantive) return a.substantive ? -1 : 1
      return byCodepoint(a.canonical, b.canonical)
    })

  return { totalIds, distinctRawIds: byRawId.size, nonDigit, collisions }
}

export interface FormatOptions {
  /** Most entries printed per finding list. Default 20. */
  readonly sampleLimit?: number
}

/**
 * The id verbatim and unambiguous. `JSON.stringify` rather than bare quotes
 * because a CSV-debris id can ITSELF start with an apostrophe (`'180`) or
 * carry whitespace — `''180'` is unreadable and `"'180"` is not.
 */
function quoteId(rawId: string): string {
  return JSON.stringify(rawId)
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

/** `showing N of M …`, or `all M …` when the whole list fits. */
function sampleHeader(shown: number, total: number, noun: string): string {
  const label = `${total} ${plural(total, noun)}`
  return shown === total ? `all ${label}` : `showing ${shown} of ${label}`
}

function formatNonDigit(
  findings: readonly NonDigitClubId[],
  limit: number
): string[] {
  if (findings.length === 0) {
    return ['  OK — no club id contains a non-digit']
  }
  const shown = findings.slice(0, limit)
  const lines = [
    `  FINDING — non-digit club ids: ` +
      `${sampleHeader(shown.length, findings.length, 'distinct form')}`,
  ]
  for (const finding of shown) {
    lines.push(
      `    ${quoteId(finding.rawId)}  x${finding.count}  ` +
        `districts: ${finding.districts.join(', ')}  ` +
        `[${finding.sources.join(', ')}]`
    )
  }
  return lines
}

function formatCollisions(
  collisions: readonly CanonicalCollision[],
  limit: number
): string[] {
  const substantive = collisions.filter(c => c.substantive)
  const benign = collisions.length - substantive.length
  const benignNote =
    benign === 0
      ? ''
      : ` (plus ${benign} padding-only ${plural(benign, 'group')} — ` +
        `the same club in two lexical forms, benign)`

  if (substantive.length === 0) {
    return [
      `  OK — no two distinct source ids canonicalize onto one key${benignNote}`,
    ]
  }

  const shown = substantive.slice(0, limit)
  const lines = [
    `  FINDING — canonical collisions: ` +
      `${sampleHeader(shown.length, substantive.length, 'group')}` +
      `${benignNote}`,
  ]
  for (const collision of shown) {
    // The club names are what let an operator tell "two lexical forms of one
    // club" from "two different clubs sharing one published key" at a glance.
    const names =
      collision.clubNames.length === 0
        ? ''
        : `  names: ${collision.clubNames.join(' | ')}`
    lines.push(
      `    ${quoteId(collision.canonical)}  <-  ` +
        `${collision.rawIds.map(quoteId).join(', ')}  ` +
        `districts: ${collision.districts.join(', ')}${names}`
    )
  }
  return lines
}

/**
 * The human report. Findings are grouped by program year, printed verbatim,
 * and truncation is always stated — a silent cut reads as "that's all of
 * them".
 */
export function formatClubIdCensus(
  years: readonly ProgramYearCensus[],
  options: FormatOptions = {}
): string {
  const limit = options.sampleLimit ?? 20

  if (years.length === 0) {
    return (
      'Club-id census: no snapshot was scanned — ' +
      'nothing was synced, so nothing is settled.'
    )
  }

  const totalIds = years.reduce((sum, year) => sum + year.census.totalIds, 0)
  const nonDigitForms = years.reduce(
    (sum, year) => sum + year.census.nonDigit.length,
    0
  )
  const substantiveGroups = years.reduce(
    (sum, year) =>
      sum + year.census.collisions.filter(c => c.substantive).length,
    0
  )

  const verdict =
    nonDigitForms === 0 && substantiveGroups === 0
      ? 'VERDICT: no club id contains a non-digit, and no two distinct ' +
        'source ids canonicalize onto one key.'
      : `VERDICT: ${nonDigitForms} distinct non-digit id form(s) and ` +
        `${substantiveGroups} substantive collision group(s) — see below.`

  const lines = [
    `Club-id census — ${years.length} program year(s), ${totalIds} club ids`,
    verdict,
  ]

  for (const year of years) {
    lines.push('')
    lines.push(
      `${year.programYear} · snapshot ${year.snapshotDate} · ` +
        `${year.districtFiles} district files · ` +
        `${year.census.totalIds} club ids ` +
        `(${year.census.distinctRawIds} distinct)`
    )
    lines.push(...formatNonDigit(year.census.nonDigit, limit))
    lines.push(...formatCollisions(year.census.collisions, limit))
  }

  return lines.join('\n')
}

// ── CLI ─────────────────────────────────────────────────────────────────────

interface Args {
  cacheDir: string
  json: boolean
  sampleLimit: number
}

function parseArgs(argv: string[]): Args {
  let cacheDir = './cache'
  let json = false
  let sampleLimit = 20

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--json') {
      json = true
    } else if (arg === '--cache-dir') {
      const value = argv[++i]
      if (!value) throw new Error('--cache-dir needs a directory')
      cacheDir = value
    } else if (arg.startsWith('--cache-dir=')) {
      cacheDir = arg.slice('--cache-dir='.length)
    } else if (arg === '--sample-limit') {
      const value = argv[++i]
      if (!value) throw new Error('--sample-limit needs a number')
      sampleLimit = Number.parseInt(value, 10)
    } else if (arg.startsWith('--sample-limit=')) {
      sampleLimit = Number.parseInt(arg.slice('--sample-limit='.length), 10)
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }

  if (!Number.isInteger(sampleLimit) || sampleLimit < 1) {
    throw new Error('--sample-limit must be a positive integer')
  }

  return { cacheDir, json, sampleLimit }
}

/** Census one synced snapshot directory. */
function censusSnapshot(
  snapshotsDir: string,
  snapshotDate: string
): ProgramYearCensus {
  const dir = join(snapshotsDir, snapshotDate)
  const fileNames = readdirSync(dir).filter(isDistrictSnapshotFile).sort()

  const occurrences: ClubIdOccurrence[] = []
  for (const fileName of fileNames) {
    const parsed: unknown = JSON.parse(
      readFileSync(join(dir, fileName), 'utf-8')
    )
    occurrences.push(...collectClubIdOccurrences(fileName, parsed))
  }

  return {
    programYear: programYearForSnapshotDate(snapshotDate),
    snapshotDate,
    districtFiles: fileNames.length,
    census: buildClubIdCensus(occurrences),
  }
}

/**
 * Exit codes: 0 = a census was produced, findings or not · 2 = setup error
 * (nothing to scan). A FINDING NEVER CHANGES THE EXIT CODE — the run's
 * red/green belongs to the CEO Report oracle, and this is a different
 * question. See the file header.
 */
function main(): void {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(
      'Usage: clubIdCensus.ts --cache-dir <dir> [--json] ' +
        '[--sample-limit <n>]\n'
    )
    process.stderr.write(`${err instanceof Error ? err.message : err}\n`)
    process.exit(2)
  }

  const snapshotsDir = join(args.cacheDir, 'snapshots')
  if (!existsSync(snapshotsDir)) {
    process.stderr.write(`No snapshots directory under ${snapshotsDir}.\n`)
    process.stderr.write('Sync the snapshot archive from GCS first (R2).\n')
    process.exit(2)
  }

  const snapshotDates = readdirSync(snapshotsDir, { withFileTypes: true })
    .filter(
      entry => entry.isDirectory() && SNAPSHOT_DATE_DIR_PATTERN.test(entry.name)
    )
    .map(entry => entry.name)
    .sort()

  if (snapshotDates.length === 0) {
    process.stderr.write(`No snapshot directories under ${snapshotsDir}.\n`)
    process.exit(2)
  }

  const years = snapshotDates.map(date => censusSnapshot(snapshotsDir, date))

  process.stderr.write(
    `${formatClubIdCensus(years, { sampleLimit: args.sampleLimit })}\n`
  )
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ years }, null, 2)}\n`)
  }
  process.exit(0)
}

// Only when run directly. Under vitest argv[1] is the vitest binary, so
// importing this module never touches the filesystem.
if (process.argv[1]?.endsWith('clubIdCensus.ts')) {
  main()
}
