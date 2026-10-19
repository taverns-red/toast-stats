/**
 * Reports rollups — Runner (#2012, the remainder of #1799)
 *
 * Thin glue around the pure fold in ./lib/reportsRollups.js:
 *
 *   build --date <YYYY-MM-DD> --reports <dir> --rankings <file>
 *         --region-history <file> --out <file>
 *
 * - <reports>/district_*_reports.json: every sidecar at the date;
 * - <rankings>: the date's all-districts-rankings.json, whose rows name the
 *   date's districts, so a district without a sidecar reads null;
 * - <region-history>: config/district-region-history.json; a missing file
 *   means no region blocks (the reason is written into the artifact).
 * Every input is validated against its shared contract (fail closed: a
 * contract violation is a bug, and nothing is written); gzip layers are
 * peeled (gcloud 568 hands back `-Z` bytes as stored). The output is
 * validated against ReportsRollupsSchema before it is written (compact JSON).
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
  ReportsRollupsSchema,
} from '@taverns-red/shared-contracts'
import type { z } from 'zod'
import { buildReportsRollups } from './lib/reportsRollups.js'
import { summarizeZodIssues } from './lib/zodIssueSummary.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SIDECAR = /^district_[A-Za-z0-9]+_reports\.json$/

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function fail(msg: string): never {
  log(`::error::build-reports-rollups: ${msg}`)
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

function main(): void {
  if (process.argv[2] !== 'build') {
    fail(
      'usage: build-reports-rollups.ts build --date <d> --reports <dir> --rankings <file> --region-history <file> --out <file>'
    )
  }
  const date = arg('date')
  if (!ISO_DATE.test(date)) fail(`--date is not YYYY-MM-DD: ${date}`)
  const reportsDir = arg('reports')
  const rankingsFile = arg('rankings')
  const historyFile = arg('region-history')
  const out = arg('out')

  if (!fs.existsSync(rankingsFile)) fail(`no rankings at ${rankingsFile}`)
  const rankings = readValid(
    rankingsFile,
    AllDistrictsRankingsDataSchema,
    'all-districts-rankings'
  )
  const districtIds = rankings.rankings.map(r => r.districtId)
  if (districtIds.length === 0) fail(`${rankingsFile} lists no districts`)

  const files = fs.existsSync(reportsDir)
    ? fs
        .readdirSync(reportsDir)
        .filter(f => SIDECAR.test(f))
        .sort()
    : []
  const reports = files.map(f =>
    readValid(
      path.join(reportsDir, f),
      DistrictReportsDatasetSchema,
      'district-reports'
    )
  )

  const regionHistory = fs.existsSync(historyFile)
    ? readValid(
        historyFile,
        DistrictRegionHistorySchema,
        'district-region-history'
      )
    : null

  const rollups = ReportsRollupsSchema.parse(
    buildReportsRollups({
      snapshotDate: date,
      generatedAt: new Date().toISOString(),
      districtIds,
      reports,
      regionHistory,
    })
  )
  const body = Buffer.from(JSON.stringify(rollups))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, body)

  const without = rollups.world.districtsWithoutReports
  if (without.length > 0) {
    log(
      `::warning::build-reports-rollups: ${without.length} of ${districtIds.length} districts have no usable reports at ${date} (${without.join(', ')}); their figures and every block above them are null`
    )
  }
  if (rollups.regionMembershipNote) {
    log(`::warning::build-reports-rollups: ${rollups.regionMembershipNote}`)
  }
  process.stdout.write(
    `${JSON.stringify({
      snapshotDate: date,
      programYear: rollups.programYear,
      districts: districtIds.length,
      sidecars: reports.length,
      districtsWithoutReports: without.length,
      excludedDistricts: rollups.scope.excludedDistricts.length,
      regions: rollups.regions ? Object.keys(rollups.regions).length : null,
      rawBytes: body.length,
      gzipBytes: gzipSync(body).length,
    })}\n`
  )
}

main()
