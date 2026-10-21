/**
 * Plan a #1671 gap district's stale per-date objects for removal from one
 * bucket (#2232). Read-only: it prints, never removes.
 *
 * Usage: plan-gap-removals.ts <bucket> <date> [<local snapshot dir>]
 *
 * Reads the date's metadata.json and listing from <bucket>, and each gap
 * district's district_<id>.json (scripts/lib/gapRemovalIo.ts), then plans
 * with scripts/lib/gapRemoval.ts. Files under <local snapshot dir> (what
 * the run wrote) are never planned.
 *
 * stdout: one gs:// URL per line, analytics first, district files last
 * (R4); process-dates.sh hands them to gcs-remove.sh. stderr: a warning
 * per object kept, with why.
 * Exit: 0 planned (possibly nothing) · 1 a read failed · 2 usage.
 * Env: GCLOUD (default gcloud).
 */

import { readdirSync, statSync } from 'node:fs'
import * as path from 'node:path'
import { planBucketGapRemovals } from './lib/gapRemovalIo.js'

function localNames(dir: string): Set<string> {
  const out = new Set<string>()
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const f = path.join(d, e)
      if (statSync(f).isDirectory()) walk(f)
      else out.add(path.relative(dir, f).split(path.sep).join('/'))
    }
  }
  try {
    walk(dir)
  } catch {
    // No local directory: nothing to keep.
  }
  return out
}

const [bucket, date, keepDir] = process.argv.slice(2)
if (!bucket || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  process.stderr.write(
    'usage: plan-gap-removals.ts <bucket> <date> [<local snapshot dir>]\n'
  )
  process.exit(2)
}

try {
  const plan = planBucketGapRemovals(
    { gcloud: process.env.GCLOUD || 'gcloud', env: process.env },
    {
      metadataBucket: bucket,
      bucket,
      date,
      keep: keepDir ? localNames(keepDir) : new Set(),
    }
  )
  for (const k of plan.kept) {
    process.stderr.write(
      `::warning title=Gap removal::kept snapshots/${date}/${k.path}: ${k.reason}\n`
    )
  }
  for (const n of plan.remove) {
    process.stdout.write(`gs://${bucket}/snapshots/${date}/${n}\n`)
  }
} catch (e) {
  process.stderr.write(
    `::error title=Gap removal::${e instanceof Error ? e.message : String(e)}\n`
  )
  process.exit(1)
}
