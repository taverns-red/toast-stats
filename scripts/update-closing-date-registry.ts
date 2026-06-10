/**
 * Update Closing-Date Registry (#1128, epic #1098)
 *
 * Maintains docs/month-end-closing-dates.json — the registry that
 * scripts/rescrape-historical.ts and (Sprint 2, #1129) the rebuild's
 * fail-closed closing remap consume. Two sources, one writer:
 *
 *   1. DERIVED — completed closing months proven by raw-csv metadata in GCS
 *      (the same feed the daily pipeline's freshness check reads).
 *   2. MANUAL  — `--set YYYY-MM=YYYY-MM-DD` for collection-outage months
 *      whose closing date had to be established from TI behavior (the
 *      registry's value-add is exactly the months metadata cannot prove).
 *
 * All writes go through ClosingDateRegistry (dedupe, same-month update,
 * sort, atomic write) — the class's production caller per the #1128
 * decision (ADR-011). Run locally, then COMMIT the registry diff; the
 * daily pipeline's check step self-clears once the fresh file lands.
 *
 * Usage:
 *   npx tsx scripts/update-closing-date-registry.ts                # derive + append
 *   npx tsx scripts/update-closing-date-registry.ts --dry-run
 *   npx tsx scripts/update-closing-date-registry.ts --set 2026-02=2026-03-10
 *
 * Env: GCS_BUCKET (default toast-stats-data-staging), WINDOW_DAYS (default 130).
 * Logging to stderr, JSON summary to stdout (R4).
 */

import * as path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { ClosingDateRegistry } from '../packages/collector-cli/src/utils/ClosingDateRegistry.js'
import { listRawCSVDates, readMetadataForDates } from './lib/gcsHelpers.js'
import {
  deriveCompletedClosingMonths,
  parseManualEntryArg,
  type RegistryMonthEntry,
} from './lib/registryFreshness.js'

const DEFAULT_BUCKET = 'toast-stats-data-staging'
const DEFAULT_WINDOW_DAYS = 130

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

interface Args {
  dryRun: boolean
  noDerive: boolean
  manualEntries: RegistryMonthEntry[]
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, noDerive: false, manualEntries: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--no-derive') args.noDerive = true
    else if (arg === '--set' && argv[i + 1]) {
      args.manualEntries.push(parseManualEntryArg(argv[++i]!))
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

async function main(): Promise<void> {
  const { dryRun, noDerive, manualEntries } = parseArgs(process.argv.slice(2))
  const bucket = process.env.GCS_BUCKET ?? DEFAULT_BUCKET
  const windowDays = Number(process.env.WINDOW_DAYS ?? DEFAULT_WINDOW_DAYS)
  const projectRoot = path.resolve(import.meta.dirname, '..')

  const registry = new ClosingDateRegistry({
    projectRoot,
    logger: {
      info: (m, meta) => log(`[info] ${m} ${meta ? JSON.stringify(meta) : ''}`),
      warn: (m, meta) => log(`[warn] ${m} ${meta ? JSON.stringify(meta) : ''}`),
      error: (m, meta) =>
        log(`[error] ${m} ${meta ? JSON.stringify(meta) : ''}`),
      debug: () => {},
    },
  })

  const before = await registry.read()
  const beforeByMonth = new Map(
    before.months.map(m => [m.dataMonth, m.closingDate])
  )

  let derived: RegistryMonthEntry[] = []
  if (!noDerive) {
    const storage = new Storage()
    const allDates = await listRawCSVDates(storage, bucket)
    const windowDates = allDates.slice(-windowDays)
    log(
      `raw-csv: ${allDates.length} dates in gs://${bucket}, reading metadata for the last ${windowDates.length}`
    )
    const entries = await readMetadataForDates(storage, bucket, windowDates)
    derived = deriveCompletedClosingMonths(entries)
    log(`derived ${derived.length} completed closing months from metadata`)
  }

  const candidates = [...derived, ...manualEntries]
  const applied: Array<
    RegistryMonthEntry & { source: string; action: string }
  > = []

  for (const entry of candidates) {
    const source = manualEntries.includes(entry) ? 'manual' : 'derived'
    const existing = beforeByMonth.get(entry.dataMonth)

    if (existing === entry.closingDate) continue
    // Never let a DERIVED date regress a later registry date — a manual
    // outage-month entry knows more than partial metadata (same rule the
    // freshness check applies).
    if (
      source === 'derived' &&
      existing !== undefined &&
      existing > entry.closingDate
    ) {
      log(
        `[skip] ${entry.dataMonth}: registry has later ${existing} > derived ${entry.closingDate}`
      )
      continue
    }

    const action = existing === undefined ? 'added' : `updated from ${existing}`
    if (dryRun) {
      log(
        `[dry-run] would ${action === 'added' ? 'add' : action}: ${entry.dataMonth} → ${entry.closingDate} (${source})`
      )
    } else {
      await registry.append(entry)
    }
    applied.push({ ...entry, source, action })
  }

  const after = await registry.read()
  console.log(
    JSON.stringify(
      {
        dryRun,
        bucket,
        derivedCount: derived.length,
        manualCount: manualEntries.length,
        applied,
        totalMonths: after.months.length,
      },
      null,
      2
    )
  )
}

main().catch(err => {
  log(`update-closing-date-registry failed: ${(err as Error).stack ?? err}`)
  process.exit(1)
})
