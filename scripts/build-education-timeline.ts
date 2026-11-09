/**
 * Education timeline — backfill runner (#2591, epic #2590)
 *
 * The daily run appends one date to the timeline inside
 * build-education-rollup.ts. This is the one-off path that builds a whole
 * program year from the per-date `district_<id>_reports.json` snapshots, and
 * sets the prior-year ghost. No network I/O: the caller
 * (scripts/pipeline/backfill-education-timeline.sh) stages batches of dates
 * from staging, runs `fold` on each, and uploads the result.
 *
 *   fold  --py <PY> --region-history <file> --reports-root <dir>
 *         [--existing <dir>] --out <dir>
 *     <dir>/<date>/district_*_reports.json, any number of dates (a date dir
 *     with no reports is skipped: absent, never zero). Each date is folded
 *     with the rollup's own fold and upserted, so re-folding a date replaces
 *     it. --existing / --out are directories of the PY's entity files
 *     (world.json, region-<n>.json, district-<id>.json: the published
 *     layout). A date outside <PY> is an error (exit 1, nothing written).
 *     A missing region-history file ⇒ no region series.
 *
 *   ghost --py <PY> --region-history <file> --existing <dir> --out <dir>
 *         [--prior-timeline <dir> | --prior-ledger <dir>]
 *     Sets each entity file's `prior` (the previous program year's
 *     cumulative totals):
 *       --prior-timeline  that year's entity-file directory (day grain);
 *       --prior-ledger    a directory of its raw-education-ledger
 *                         district_<id>.json files (month grain);
 *       neither           the ghost stays null (not available, not zero).
 *
 * Every input is validated against its shared contract and every output is
 * validated before it is written; gzip layers are peeled.
 * Logs go to stderr; stdout is ONE JSON line (R4).
 * Exit codes: 0 written · 1 a missing or invalid input, or a fold error
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  DistrictRegionHistorySchema,
  DistrictReportsDatasetSchema,
  EducationLedgerHistoryFileSchema,
  EducationTimelineEntitySchema,
  type DistrictRegionHistory,
  type DistrictReportsDataset,
  type EducationLedgerHistoryFile,
  type EducationTimelineEntity,
} from '@taverns-red/shared-contracts'
import type { z } from 'zod'
import {
  foldReportsDate,
  ghostFromLedger,
  ghostFromTimeline,
  joinTimeline,
  previousProgramYear,
  splitTimeline,
  upsertTimelineDate,
  withPrior,
  type EducationTimeline,
} from './lib/educationTimeline.js'
import { summarizeZodIssues } from './lib/zodIssueSummary.js'

const PROGRAM_YEAR = /^\d{4}-\d{4}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function fail(msg: string): never {
  log(`::error::build-education-timeline: ${msg}`)
  process.exit(1)
}

function optArg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function arg(name: string): string {
  const value = optArg(name)
  if (!value) fail(`missing required argument --${name}`)
  return value
}

function readJson(file: string): unknown {
  let bytes = fs.readFileSync(file)
  while (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = gunzipSync(bytes)
  }
  try {
    return JSON.parse(bytes.toString('utf-8'))
  } catch (err) {
    return fail(`${file} is not JSON: ${(err as Error).message}`)
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

function programYear(): string {
  const py = arg('py')
  if (!PROGRAM_YEAR.test(py)) fail(`--py must look like 2026-2027, got "${py}"`)
  return py
}

function regionHistory(): DistrictRegionHistory | null {
  const file = arg('region-history')
  if (!fs.existsSync(file)) {
    log(`no region history at ${file}: no region series`)
    return null
  }
  return readValid(file, DistrictRegionHistorySchema, 'district-region-history')
}

function names(dir: string, pattern: RegExp): string[] {
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter(f => pattern.test(f))
        .sort()
    : []
}

const ENTITY_FILE = /^(world|region-[A-Za-z0-9]+|district-[A-Za-z0-9]+)\.json$/

/** A directory of entity files, validated, joined into one timeline. */
function readTimelineDir(dir: string, what: string): EducationTimeline | null {
  const files = new Map<string, EducationTimelineEntity>()
  for (const f of names(dir, ENTITY_FILE)) {
    files.set(
      f,
      readValid(path.join(dir, f), EducationTimelineEntitySchema, what)
    )
  }
  return joinTimeline(files)
}

function write(timeline: EducationTimeline): void {
  const out = arg('out')
  const files = splitTimeline(timeline)
  for (const [name, file] of files) {
    const checked = EducationTimelineEntitySchema.safeParse(file)
    if (!checked.success) {
      fail(
        `${timeline.programYear}/${name} violates its contract: ${summarizeZodIssues(checked.error.issues)}`
      )
    }
  }
  fs.mkdirSync(out, { recursive: true })
  // The directory is the PY's whole set: drop entity files it no longer has.
  for (const f of names(out, ENTITY_FILE)) {
    if (!files.has(f)) fs.rmSync(path.join(out, f))
  }
  for (const [name, file] of files) {
    fs.writeFileSync(path.join(out, name), JSON.stringify(file))
  }
}

function existingTimeline(py: string): EducationTimeline | null {
  const dir = optArg('existing')
  if (!dir) return null
  const t = readTimelineDir(dir, 'education-timeline-entity')
  if (t && t.programYear !== py) {
    fail(`${dir} is the ${t.programYear} timeline, not ${py}`)
  }
  return t
}

function fold(): void {
  const py = programYear()
  const history = regionHistory()
  const root = arg('reports-root')
  let timeline = existingTimeline(py)
  let datesFolded = 0
  let districtsRead = 0

  for (const date of names(root, ISO_DATE)) {
    const dir = path.join(root, date)
    const reports: DistrictReportsDataset[] = names(
      dir,
      /^district_[A-Za-z0-9]+_reports\.json$/
    ).map(f =>
      readValid(
        path.join(dir, f),
        DistrictReportsDatasetSchema,
        'district-reports'
      )
    )
    if (reports.length === 0) {
      log(`${date}: no reports; skipped (absent, never zero)`)
      continue
    }
    districtsRead += reports.length
    try {
      timeline = upsertTimelineDate(
        timeline,
        py,
        date,
        foldReportsDate({
          programYear: py,
          date,
          reports,
          regionHistory: history,
        })
      )
    } catch (err) {
      fail(`${date}: ${(err as Error).message}`)
    }
    datesFolded++
  }
  if (!timeline) fail(`no date under ${root} had reports; nothing to write`)
  write(timeline)
  process.stdout.write(
    `${JSON.stringify({
      programYear: py,
      datesFolded,
      districtsRead,
      dates: timeline.dates.length,
      asOf: timeline.asOf,
    })}\n`
  )
}

function ghost(): void {
  const py = programYear()
  const history = regionHistory()
  const timeline = existingTimeline(py)
  if (!timeline) return fail('missing required argument --existing')
  const priorTimelineFile = optArg('prior-timeline')
  const priorLedgerDir = optArg('prior-ledger')
  const priorPy = previousProgramYear(py)

  let prior = null
  if (priorTimelineFile) {
    const t = readTimelineDir(priorTimelineFile, 'education-timeline-entity')
    if (!t) return fail(`${priorTimelineFile} holds no world.json`)
    if (t.programYear !== priorPy) {
      fail(
        `${priorTimelineFile} is the ${t.programYear} timeline, not ${priorPy}`
      )
    }
    prior = ghostFromTimeline(t)
  } else if (priorLedgerDir) {
    const files: EducationLedgerHistoryFile[] = names(
      priorLedgerDir,
      /^district_[A-Za-z0-9]+\.json$/
    ).map(f =>
      readValid(
        path.join(priorLedgerDir, f),
        EducationLedgerHistoryFileSchema,
        'education-ledger-history'
      )
    )
    prior = ghostFromLedger(priorPy, files, history)
    if (!prior) log(`the ${priorPy} ledger holds no district: no ghost`)
  } else {
    log(`no prior-year source for ${priorPy}: the ghost is not available`)
  }
  write(withPrior(timeline, prior))
  process.stdout.write(
    `${JSON.stringify({
      programYear: py,
      priorProgramYear: prior?.programYear ?? null,
      grain: prior?.grain ?? null,
      source: prior?.source ?? null,
    })}\n`
  )
}

const command = process.argv[2]
if (command === 'fold') fold()
else if (command === 'ghost') ghost()
else fail(`unknown command '${command ?? ''}' (want fold | ghost)`)
