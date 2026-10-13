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
  type DistrictRegionHistory,
  type DistrictReportsDataset,
  type EducationLedgerHistoryFile,
  type EducationRollupProgramYear,
} from '@taverns-red/shared-contracts'
import type { z } from 'zod'
import {
  MAX_REPORT_CANDIDATES,
  buildEducationRollupIndex,
  planEducationRollup,
  rollUpEducationProgramYear,
  type OmittedProgramYear,
} from './lib/educationRollup.js'
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

  const index = buildEducationRollupIndex(rollups, omitted)
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
