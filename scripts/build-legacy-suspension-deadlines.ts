/**
 * One-off generator for config/legacy-suspension-deadlines.json (#3103).
 * The file was built once on 2026-11-20 by run 44803919564, and the
 * workflow has since been removed (#3105). The rules live in
 * scripts/lib/legacySuspensionDeadlines.ts.
 *
 *   plan  --listing <gcloud ls -l output> --urls <file>
 *         Picks the district_<id>.json objects of program year 2024-25 and
 *         writes their gs:// URLs, one per line. Prints {count, bytes,
 *         dates} as JSON: the bytes are the objects' stored sizes, which is
 *         what the download moves.
 *   build --input <dir> --out <file>
 *         Reads <dir>/snapshots/<date>/district_*.json, derives each club's
 *         suspension deadline and writes the file. Prints {rowCount,
 *         rowsSha256, filesRead, sourceDates} as JSON.
 *   verify --file <file> --expected <file>
 *         Exits non-zero unless the file's row count and rows checksum match
 *         the committed expectation (the upload gate, #3109 review).
 *
 * Stdout carries only the JSON summary; logs go to stderr (R4).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'

import {
  LEGACY_SOURCE_FROM,
  LEGACY_SOURCE_TO,
  buildLegacySuspensionDeadlines,
  checkAgainstExpected,
  clubStatusesOf,
  rowsSha256,
  deriveSuspensionDeadlines,
  planLegacySources,
  type ClubObservation,
} from './lib/legacySuspensionDeadlines.js'

function fail(message: string): never {
  console.error(`build-legacy-suspension-deadlines: ${message}`)
  process.exit(2)
}

function plan(listingPath: string, urlsPath: string): void {
  const result = planLegacySources(fs.readFileSync(listingPath, 'utf-8'))
  if (result.count === 0) fail('no source objects in the listing')
  fs.writeFileSync(urlsPath, result.objects.map(o => o.url).join('\n') + '\n')
  console.error(
    `plan: ${result.count} objects, ${result.bytes} bytes, ${result.dates.length} dates`
  )
  process.stdout.write(
    JSON.stringify({
      count: result.count,
      bytes: result.bytes,
      dates: result.dates,
    }) + '\n'
  )
}

function build(inputDir: string, outPath: string): void {
  const root = path.join(inputDir, 'snapshots')
  const dates = fs
    .readdirSync(root)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter(d => d >= LEGACY_SOURCE_FROM && d <= LEGACY_SOURCE_TO)
    .sort()
  if (dates.length === 0) fail(`no snapshot dates under ${root}`)
  const history = new Map<string, ClubObservation[]>()
  let filesRead = 0
  for (const date of dates) {
    const dir = path.join(root, date)
    for (const name of fs.readdirSync(dir).sort()) {
      if (!/^district_[0-9A-Za-z]+\.json$/.test(name)) continue
      const snapshot: unknown = JSON.parse(
        fs.readFileSync(path.join(dir, name), 'utf-8')
      )
      filesRead++
      for (const { clubNumber, status } of clubStatusesOf(snapshot)) {
        const seen = history.get(clubNumber) ?? []
        seen.push({ date, status })
        history.set(clubNumber, seen)
      }
    }
  }
  const file = buildLegacySuspensionDeadlines({
    rows: deriveSuspensionDeadlines(history),
    sourceDates: dates,
    generatedAt: new Date().toISOString(),
  })
  fs.writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n')
  console.error(
    `build: ${filesRead} files, ${history.size} clubs, ${file.rowCount} rows, sha256 ${file.rowsSha256}`
  )
  process.stdout.write(
    JSON.stringify({
      rowCount: file.rowCount,
      rowsSha256: file.rowsSha256,
      filesRead,
      sourceDates: file.sourceDates,
    }) + '\n'
  )
}

function verify(filePath: string, expectedPath: string): void {
  const file = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
    rowCount: number
    rows: Record<string, string>
  }
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8')) as {
    rowCount: number
    rowsSha256: string
  }
  // Recount and rehash the rows themselves, not the file's own summary.
  const built = {
    rowCount: Object.keys(file.rows).length,
    rowsSha256: rowsSha256(file.rows),
  }
  const problems = checkAgainstExpected(built, expected)
  if (problems.length > 0) fail(`not uploading: ${problems.join('; ')}`)
  console.error(
    `verify: ${built.rowCount} rows, sha256 ${built.rowsSha256} match ${expectedPath}`
  )
  process.stdout.write(JSON.stringify({ ok: true, ...built }) + '\n')
}

const [command, ...rest] = process.argv.slice(2)
const { values } = parseArgs({
  args: rest,
  options: {
    listing: { type: 'string' },
    urls: { type: 'string' },
    input: { type: 'string' },
    out: { type: 'string' },
    file: { type: 'string' },
    expected: { type: 'string' },
  },
})
if (command === 'plan' && values.listing && values.urls) {
  plan(values.listing, values.urls)
} else if (command === 'build' && values.input && values.out) {
  build(values.input, values.out)
} else if (command === 'verify' && values.file && values.expected) {
  verify(values.file, values.expected)
} else {
  fail(
    'usage: plan --listing <file> --urls <file> | build --input <dir> --out <file> | verify --file <file> --expected <file>'
  )
}
