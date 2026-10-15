/**
 * One-off: delete a #1671 gap district's stale per-district objects (#2038).
 *
 * Usage:
 *   npx tsx scripts/prune-gap-districts.ts --bucket staging|prod \
 *     --dates 2017-01-31,2018-03-31 [--execute] \
 *     [--manifest gap-prune.jsonl] [--audit-object runs/<id>/gap-prune.jsonl]
 *
 * Dry run unless `--execute`. For each date, reads the bucket's own
 * `metadata.json`; for each district it records as a source gap whose
 * `district_<id>.json` has 0 clubs, deletes that file and its
 * `analytics/district_<id>_*.json` (see scripts/lib/pruneGapDistricts.ts).
 * Writes one audit row per object to `--manifest`; with `--execute` and
 * `--audit-object`, the manifest is also kept in the staging bucket at that
 * path (never overwriting). Rows never hold object content.
 *
 * Summary JSON on stdout; logs on stderr (R4). Exits 1 if any row errored.
 */

import { writeFile } from 'node:fs/promises'
import { Storage } from '@google-cloud/storage'
import { pruneBucket } from './lib/gcsMedia.js'
import { runPrune, toJsonl } from './lib/pruneGapDistricts.js'
import { BUCKETS, parseDates } from './lib/stripClubContact.js'

interface Args {
  bucket: keyof typeof BUCKETS
  dates: string[]
  execute: boolean
  manifest: string
  auditObject: string | null
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i === -1 ? undefined : argv[i + 1]
  }
  const bucket = value('--bucket')
  if (bucket !== 'staging' && bucket !== 'prod') {
    throw new Error('--bucket must be staging or prod')
  }
  return {
    bucket,
    dates: parseDates(value('--dates') ?? ''),
    execute: argv.includes('--execute'),
    manifest: value('--manifest') ?? 'gap-prune.jsonl',
    auditObject: value('--audit-object') ?? null,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const bucketName = BUCKETS[args.bucket]
  const storage = new Storage()
  console.error(
    `[gap-prune] ${args.execute ? 'EXECUTE' : 'dry run'} on ` +
      `gs://${bucketName} for ${args.dates.length} date(s)`
  )
  const { rows, summary } = await runPrune(pruneBucket(storage, bucketName), {
    bucket: bucketName,
    dates: args.dates,
    dryRun: !args.execute,
  })
  const jsonl = toJsonl(rows)
  await writeFile(args.manifest, jsonl)

  if (args.execute && args.auditObject) {
    await storage
      .bucket(BUCKETS.staging)
      .file(args.auditObject)
      .save(jsonl, {
        resumable: false,
        metadata: { contentType: 'application/x-ndjson' },
        preconditionOpts: { ifGenerationMatch: 0 },
      })
    console.error(
      `[gap-prune] audit kept at gs://${BUCKETS.staging}/${args.auditObject}`
    )
  }

  for (const row of rows) {
    const line = `[gap-prune] ${row.action} ${row.path}: ${row.reason}`
    console.error(row.action === 'error' ? `::error::${line}` : line)
  }
  console.error(
    `[gap-prune] ${summary.gapDistricts.length} gap district(s): ` +
      `${summary.planned} planned, ${summary.deleted} deleted, ` +
      `${summary.kept} kept, ${summary.errors} errors`
  )
  process.stdout.write(JSON.stringify(summary) + '\n')
  if (summary.errors > 0) process.exitCode = 1
}

main().catch(err => {
  console.error(
    `::error::[gap-prune] ${err instanceof Error ? err.message : 'failed'}`
  )
  process.exitCode = 1
})
