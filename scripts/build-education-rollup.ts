/**
 * Education rollup — Runner (#1801, epic #1781)
 *
 * Thin glue around the pure fold in ./lib/educationRollup.js. Two commands:
 *
 *   plan --ledger <dir>
 *     stdin: staged snapshot dates, one per line. stdout: one TSV line per
 *     program year — `<PY>\t<source>\t<rankingsDate|->\t<candidates|->`,
 *     candidates comma-separated, newest first — for the caller to download.
 *     The ledger PYs are the `<dir>/<PY>/` directories the caller synced.
 *
 *   build --ledger <dir> --inputs <dir> --region-history <file> --out <dir>
 *     For every PY directory under <inputs> (one per plan line):
 *       - `ledger-history`: <ledger>/<PY>/district_*.json;
 *       - `reports`: <inputs>/<PY>/reports-date names the snapshot date read,
 *         <inputs>/<PY>/reports/district_*_reports.json the datasets; no
 *         reports-date ⇒ the PY is omitted (named in the index, never zero);
 *       - <inputs>/<PY>/all-districts-rankings.json, if present, lists the
 *         PY's districts, so a district without a file is "not available".
 *     Every input is validated against its shared contract (fail closed: a
 *     contract violation is a bug, and the previous derived/ copy stands);
 *     gzip layers are peeled (gcloud 568 hands back `-Z` bytes as stored).
 *     A missing region-history file ⇒ no region rollups. Writes
 *     <out>/<PY>.json and <out>/index.json (compact JSON), each validated.
 *     Optional --timeline-in <dir> --timeline-current <PY> (#2591): the
 *     education timeline files already published, <dir>/<PY>/<entity>.json
 *     (world.json, region-<n>.json, district-<id>.json). <PY> = the current
 *     PY: every entity's point for its reports date is appended, and ONLY the
 *     files whose data changed are written, to <out>/timeline/<PY>/<file>
 *     (scripts/lib/educationTimeline.ts). The current PY is seeded only if its
 *     <dir>/<PY>/ exists (the caller read the bucket; empty = first run).
 *     Other PYs in <dir> may hold just world.json, to be named in the index
 *     (`timelines`, by PY prefix). A PY whose files fail their contract is
 *     warned about, left as it is and not named: it never stops the rollup.
 *
 * Logs go to stderr; stdout is ONE JSON line (R4).
 * Exit codes: 0 written · 1 a missing or invalid input, or a fold error
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  AllDistrictsRankingsDataSchema,
  DistrictRegionHistorySchema,
  DistrictReportsDatasetSchema,
  EducationLedgerHistoryFileSchema,
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
  EducationTimelineEntitySchema,
  educationTimelineEntityFile,
  type DistrictRegionHistory,
  type DistrictReportsDataset,
  type EducationLedgerHistoryFile,
  type EducationRollupProgramYear,
  type EducationTimelineEntity,
} from '@taverns-red/shared-contracts'
import type { z } from 'zod'
import {
  MAX_REPORT_CANDIDATES,
  buildEducationRollupIndex,
  planEducationRollup,
  rollUpEducationProgramYear,
  type OmittedProgramYear,
} from './lib/educationRollup.js'
import { planTimelineUpdates } from './lib/educationTimeline.js'
import { summarizeZodIssues } from './lib/zodIssueSummary.js'

const PROGRAM_YEAR = /^\d{4}-\d{4}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function fail(msg: string): never {
  log(`::error::build-education-rollup: ${msg}`)
  process.exit(1)
}

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  if (!value) fail(`missing required argument --${name}`)
  return value
}

function optArg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

/** Read a JSON file, peeling every gzip layer first. */
function readJson(file: string): unknown {
  let bytes = fs.readFileSync(file)
  while (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = gunzipSync(bytes)
  }
  try {
    return JSON.parse(bytes.toString('utf-8'))
  } catch (err) {
    fail(`${file} is not JSON: ${(err as Error).message}`)
  }
}

function readValid<T>(file: string, schema: z.ZodType<T>, what: string): T {
  const parsed = schema.safeParse(readJson(file))
  if (!parsed.success) {
    fail(
      `${file} violates the ${what} contract: ${summarizeZodIssues(parsed.error.issues)}`
    )
  }
  return parsed.data
}

function programYearDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && PROGRAM_YEAR.test(e.name))
    .map(e => e.name)
    .sort()
}

function jsonFiles(dir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => pattern.test(f))
    .sort()
    .map(f => path.join(dir, f))
}

function plan(): void {
  const ledgerPys = programYearDirs(arg('ledger'))
  const dates = fs
    .readFileSync(0, 'utf-8')
    .split('\n')
    .map(s => s.trim())
  for (const p of planEducationRollup(ledgerPys, dates)) {
    process.stdout.write(
      [
        p.programYear,
        p.source,
        p.rankingsDate ?? '-',
        p.reportCandidates.length > 0 ? p.reportCandidates.join(',') : '-',
      ].join('\t') + '\n'
    )
  }
}

/** The timeline files already published, per PY; PYs that cannot be read. */
function readExistingTimelines(): {
  existing: Map<string, Map<string, EducationTimelineEntity>>
  blocked: Set<string>
} {
  const existing = new Map<string, Map<string, EducationTimelineEntity>>()
  const blocked = new Set<string>()
  const dir = optArg('timeline-in')
  if (!dir) return { existing, blocked }
  for (const py of programYearDirs(dir)) {
    const files = new Map<string, EducationTimelineEntity>()
    for (const f of jsonFiles(
      path.join(dir, py),
      /^(world|region-[A-Za-z0-9]+|district-[A-Za-z0-9]+)\.json$/
    )) {
      const name = path.basename(f)
      const parsed = EducationTimelineEntitySchema.safeParse(readJsonOrNull(f))
      const why = !parsed.success
        ? summarizeZodIssues(parsed.error.issues)
        : parsed.data.programYear !== py
          ? `names program year ${parsed.data.programYear}`
          : educationTimelineEntityFile(
                parsed.data.entity.kind,
                parsed.data.entity.id
              ) !== name
            ? `holds ${parsed.data.entity.kind} ${parsed.data.entity.id ?? ''}, not what its name says`
            : null
      if (parsed.success && why === null) files.set(name, parsed.data)
      else {
        blocked.add(py)
        log(
          `::warning::education timeline ${py}/${name} is unreadable (${why}): ${py} is left as it is, not updated or named`
        )
        break
      }
    }
    existing.set(py, files)
  }
  return { existing, blocked }
}

function readJsonOrNull(file: string): unknown {
  try {
    let bytes = fs.readFileSync(file)
    while (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      bytes = gunzipSync(bytes)
    }
    return JSON.parse(bytes.toString('utf-8'))
  } catch {
    return null
  }
}

/** Fold today's reports date into the current PY's entity files; validate. */
function foldTimelines(rollups: readonly EducationRollupProgramYear[]) {
  const current = optArg('timeline-current')
  if (!current) {
    return { written: [], rows: [], skipped: [] } as ReturnType<
      typeof planTimelineUpdates
    >
  }
  const { existing, blocked } = readExistingTimelines()
  const plan = planTimelineUpdates(rollups, existing, current, blocked)
  for (const s of plan.skipped) {
    log(
      `::warning::education timeline ${s.programYear} not updated: ${s.reason}`
    )
  }
  for (const w of plan.written) {
    for (const [name, file] of w.files) {
      const checked = EducationTimelineEntitySchema.safeParse(file)
      if (!checked.success) {
        fail(
          `${w.programYear}/${name} violates its contract: ${summarizeZodIssues(checked.error.issues)}`
        )
      }
    }
  }
  return plan
}

function build(): void {
  const ledgerDir = arg('ledger')
  const inputsDir = arg('inputs')
  const regionFile = arg('region-history')
  const outDir = arg('out')

  let regionHistory: DistrictRegionHistory | null = null
  if (fs.existsSync(regionFile)) {
    regionHistory = readValid(
      regionFile,
      DistrictRegionHistorySchema,
      'district-region-history'
    )
  } else {
    log(`no region history at ${regionFile}: no region rollups this run`)
  }

  const ledgerPys = new Set(programYearDirs(ledgerDir))
  const rollups: EducationRollupProgramYear[] = []
  const omitted: OmittedProgramYear[] = []

  for (const programYear of programYearDirs(inputsDir)) {
    const dir = path.join(inputsDir, programYear)
    const rankingsFile = path.join(dir, 'all-districts-rankings.json')
    const districtIds = fs.existsSync(rankingsFile)
      ? readValid(
          rankingsFile,
          AllDistrictsRankingsDataSchema,
          'all-districts-rankings'
        ).rankings.map(r => r.districtId)
      : []

    let ledgerFiles: EducationLedgerHistoryFile[] = []
    let reports: DistrictReportsDataset[] = []
    let sourceDate: string | null = null
    const source = ledgerPys.has(programYear) ? 'ledger-history' : 'reports'
    if (source === 'ledger-history') {
      ledgerFiles = jsonFiles(
        path.join(ledgerDir, programYear),
        /^district_[A-Za-z0-9]+\.json$/
      ).map(f =>
        readValid(
          f,
          EducationLedgerHistoryFileSchema,
          'education-ledger-history'
        )
      )
    } else {
      const dateFile = path.join(dir, 'reports-date')
      if (!fs.existsSync(dateFile)) {
        omitted.push({
          programYear,
          reason: `no reports at any of the program year's last ${MAX_REPORT_CANDIDATES} snapshot dates`,
        })
        log(`::warning::education rollup: ${programYear} omitted (no reports)`)
        continue
      }
      sourceDate = fs.readFileSync(dateFile, 'utf-8').trim()
      if (!ISO_DATE.test(sourceDate)) {
        fail(`${dateFile} is not a YYYY-MM-DD date: "${sourceDate}"`)
      }
      reports = jsonFiles(
        path.join(dir, 'reports'),
        /^district_[A-Za-z0-9]+_reports\.json$/
      ).map(f => readValid(f, DistrictReportsDatasetSchema, 'district-reports'))
    }

    const rollup = rollUpEducationProgramYear({
      programYear,
      source,
      sourceDate,
      ledgerFiles,
      reports,
      districtIds,
      regionHistory,
    })
    const checked = EducationRollupProgramYearSchema.safeParse(rollup)
    if (!checked.success) {
      fail(
        `${programYear} rollup violates its contract: ${summarizeZodIssues(checked.error.issues)}`
      )
    }
    rollups.push(rollup)
  }

  if (rollups.length === 0) fail('no program year could be rolled up')

  const { written, rows } = foldTimelines(rollups)
  const index = buildEducationRollupIndex(rollups, omitted, rows)
  const checkedIndex = EducationRollupIndexSchema.safeParse(index)
  if (!checkedIndex.success) {
    fail(
      `the index violates its contract: ${summarizeZodIssues(checkedIndex.error.issues)}`
    )
  }

  fs.mkdirSync(outDir, { recursive: true })
  let rawBytes = 0
  let gzipBytes = 0
  let maxGzipBytes = 0
  const write = (name: string, value: unknown): void => {
    const body = Buffer.from(JSON.stringify(value), 'utf-8')
    fs.writeFileSync(path.join(outDir, name), body)
    const gz = gzipSync(body).length
    rawBytes += body.length
    gzipBytes += gz
    maxGzipBytes = Math.max(maxGzipBytes, gz)
  }
  for (const r of rollups) write(`${r.programYear}.json`, r)
  for (const w of written) {
    fs.mkdirSync(path.join(outDir, 'timeline', w.programYear), {
      recursive: true,
    })
    for (const [name, file] of w.files) {
      write(`timeline/${w.programYear}/${name}`, file)
    }
  }
  write('index.json', index)

  for (const r of rollups) {
    log(
      `education rollup ${r.programYear} (${r.source}${r.sourceDate ? ` @ ${r.sourceDate}` : ''}): ` +
        `${r.world.totals.awards} awards, ${r.world.districtsAvailable.length} districts available, ` +
        `${r.world.districtsNotAvailable.length} not available, ` +
        `${r.regions ? Object.keys(r.regions).length : 0} regions`
    )
  }
  process.stdout.write(
    `${JSON.stringify({
      programYears: rollups.length,
      omitted: omitted.length,
      timelinesWritten: written.reduce((n, w) => n + w.files.size, 0),
      first: rollups[0]?.programYear,
      last: rollups.at(-1)?.programYear,
      asOf: index.asOf,
      rawBytes,
      gzipBytes,
      maxGzipBytes,
    })}\n`
  )
}

const command = process.argv[2]
if (command === 'plan') plan()
else if (command === 'build') build()
else fail(`unknown command '${command ?? ''}' (want plan | build)`)
