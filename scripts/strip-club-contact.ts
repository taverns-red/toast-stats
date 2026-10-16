/**
 * One-off: strip club `email`/`phone` from snapshot objects in place (#2026).
 *
 * Usage:
 *   npx tsx scripts/strip-club-contact.ts --bucket staging|prod \
 *     --dates 2026-06-30,2026-10-09 [--only reports] [--execute] \
 *     [--manifest contact-strip.jsonl] [--audit-object runs/<id>/contact-strip.jsonl]
 *
 * Dry run unless `--execute`. Reads every `.json` under `snapshots/<date>/`
 * (only `district_<id>_reports.json` with `--only reports`, #2097),
 * rewrites only objects that carry a contact key or a meeting link in place
 * text (#2069; see
 * scripts/lib/stripClubContact.ts for the byte-level contract), and writes
 * one audit row per object to `--manifest`. With `--execute` and
 * `--audit-object`, the manifest is also kept in the staging bucket at that
 * path (never overwriting). Rows never hold a value.
 *
 * Summary JSON on stdout; logs on stderr (R4). Exits 1 if any object failed.
 */

import { writeFile } from 'node:fs/promises'
import { Storage } from '@google-cloud/storage'
import { stripBucket } from './lib/gcsMedia.js'
import {
  BUCKETS,
  parseDates,
  runStrip,
  toJsonl,
} from './lib/stripClubContact.js'

interface Args {
  bucket: keyof typeof BUCKETS
  dates: string[]
  execute: boolean
  only: 'reports' | undefined
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
  const only = value('--only')
  if (only !== undefined && only !== 'reports') {
    throw new Error('--only must be reports')
  }
  return {
    bucket,
    dates: parseDates(value('--dates') ?? ''),
    execute: argv.includes('--execute'),
    only,
    manifest: value('--manifest') ?? 'contact-strip.jsonl',
    auditObject: value('--audit-object') ?? null,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const bucketName = BUCKETS[args.bucket]
  const storage = new Storage()
  console.error(
    `[contact-strip] ${args.execute ? 'EXECUTE' : 'dry run'} on ` +
      `gs://${bucketName} for ${args.dates.join(', ')}` +
      (args.only ? ` (only ${args.only})` : '')
  )
  const started = Date.now()
  const { rows, summary } = await runStrip(stripBucket(storage, bucketName), {
    bucket: bucketName,
    dates: args.dates,
    dryRun: !args.execute,
    only: args.only,
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
      `[contact-strip] audit kept at gs://${BUCKETS.staging}/${args.auditObject}`
    )
  }

  for (const row of rows.filter(r => r.action === 'error')) {
    console.error(`::error::[contact-strip] ${row.path}: ${row.error}`)
  }
  console.error(
    `[contact-strip] ${summary.objects} objects: ${summary.planned} planned, ` +
      `${summary.stripped} stripped, ${summary.unchanged} unchanged, ` +
      `${summary.errors} errors, ${summary.keysRemoved} keys removed, ` +
      `${summary.placeValuesScrubbed} place links scrubbed, ` +
      `${summary.keysRestored} place keys restored, ` +
      `${summary.schemaFailures} contract failures ` +
      `in ${Date.now() - started} ms`
  )
  process.stdout.write(JSON.stringify(summary) + '\n')
  if (summary.errors > 0) process.exitCode = 1
}

main().catch(err => {
  // Our own messages only: no object content reaches a log.
  console.error(
    `::error::[contact-strip] ${err instanceof Error ? err.message : 'failed'}`
  )
  process.exitCode = 1
})
