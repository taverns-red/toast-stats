/**
 * CDN manifests — Runner (#1743, plan P3-3)
 *
 * Writes v1/latest.json, v1/dates.json and, when asked, v1/rankings.json and
 * v1/rank-history/{id}.json for the "Generate CDN manifests" step to upload.
 * These were four inline `node -e` blocks; one process now builds all four,
 * so the step pays a single tsx start-up.
 *
 * Thin glue: the builders in ./cdnManifests.ts and ./rankHistory.ts are
 * unit-tested and pinned byte for byte against the old inline code
 * (__tests__/goldenParity.test.ts). Reads only local files (R2: the step
 * syncs inputs first). Logs go to stderr (R4); stdout stays empty.
 *
 * Usage:
 *   npx tsx scripts/manifests/build-cdn-manifests.ts \
 *     --latest-date 2026-10-10 --latest-out /tmp/latest.json \
 *     --dates-file /tmp/all-dates.txt --dates-out /tmp/dates.json \
 *     [--rankings-src <all-districts-rankings.json> --rankings-out /tmp/rankings.json] \
 *     [--rank-history-src /tmp/rank-history-src --rank-history-out /tmp/rank-history-out]
 *
 * Exits non-zero when an input cannot be read or the rankings source cannot
 * be parsed. A single unreadable rank-history file is skipped, as before.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  datesIndexJson,
  latestManifestJson,
  rankingsManifestJson,
} from './cdnManifests.js'
import { writeRankHistory } from './rankHistory.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function optional(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function required(name: string): string {
  const value = optional(name)
  if (!value) {
    log(`Missing required argument --${name}`)
    process.exit(1)
  }
  return value
}

/** Both flags of a pair, or neither. */
function pair(src: string, out: string): [string, string] | undefined {
  const a = optional(src)
  const b = optional(out)
  if (!a && !b) return undefined
  if (!a || !b) {
    log(`--${src} and --${out} must be given together`)
    process.exit(1)
  }
  return [a, b]
}

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

const latestDate = required('latest-date')
const latestOut = required('latest-out')
const datesFile = required('dates-file')
const datesOut = required('dates-out')
const rankings = pair('rankings-src', 'rankings-out')
const rankHistory = pair('rank-history-src', 'rank-history-out')

const generatedAt = (): string => new Date().toISOString()

write(latestOut, latestManifestJson(latestDate, generatedAt()))
log(`Generated v1/latest.json for ${latestDate}`)

const dates = datesIndexJson(readFileSync(datesFile, 'utf-8'), generatedAt())
write(datesOut, dates.json)
log('Generated v1/dates.json with ' + dates.count + ' dates')

if (rankings) {
  const [src, out] = rankings
  const built = rankingsManifestJson(
    readFileSync(src, 'utf-8'),
    latestDate,
    generatedAt()
  )
  write(out, built.json)
  log('Generated v1/rankings.json with ' + built.count + ' districts')
}

if (rankHistory) {
  const [srcDir, outDir] = rankHistory
  log(writeRankHistory(srcDir, outDir, log))
}
