/**
 * Time-series publish plan — Runner (#1731, plan E2-1)
 *
 * Thin glue around ./lib/timeSeriesPublishPlan.js, called by
 * scripts/pipeline/publish-stores.sh. Hashes every file under <localDir>,
 * compares against the remote listing, and prints the files to upload to
 * stdout as NUL-separated `<sha256>\0<relpath>\0` pairs (for `xargs -0 -n 2`).
 * Counts go to stderr (R4).
 *
 * Usage: npx tsx scripts/time-series-publish-plan.ts \
 *          <localDir> <listing.json> <objectPrefix>
 * Exit codes: 0 ok · 1 unreadable or malformed listing · 2 usage
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import * as path from 'node:path'
import {
  parseObjectsListing,
  planTimeSeriesUploads,
  type LocalFile,
} from './lib/timeSeriesPublishPlan.js'

function localFiles(root: string): LocalFile[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.join(e.parentPath, e.name))
    .map(abs => ({
      rel: path.relative(root, abs).split(path.sep).join('/'),
      sha256: createHash('sha256').update(readFileSync(abs)).digest('hex'),
    }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
}

function main(argv: string[]): number {
  const [localDir, listingFile, objectPrefix] = argv
  if (!localDir || !listingFile || !objectPrefix) {
    process.stderr.write(
      'Usage: time-series-publish-plan.ts <localDir> <listing.json> <objectPrefix>\n'
    )
    return 2
  }
  let remote
  try {
    remote = parseObjectsListing(JSON.parse(readFileSync(listingFile, 'utf-8')))
  } catch (err) {
    process.stderr.write(
      `::error::time-series publish plan: bad remote listing: ${err instanceof Error ? err.message : String(err)}\n`
    )
    return 1
  }
  const plan = planTimeSeriesUploads(localFiles(localDir), remote, objectPrefix)
  for (const f of plan.upload) process.stdout.write(`${f.sha256}\0${f.rel}\0`)
  process.stderr.write(
    `time-series publish plan: ${plan.upload.length} to upload, ${plan.unchanged} unchanged\n`
  )
  return 0
}

process.exitCode = main(process.argv.slice(2))
