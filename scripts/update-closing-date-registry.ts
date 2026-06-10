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
 * Which writes apply is decided by the unit-tested planRegistryUpdates
 * (skip identical; derived never regresses a later registry date; manual
 * overrides either way). All writes go through ClosingDateRegistry (dedupe,
 * same-month update, sort, atomic write) — the class's production caller
 * per ADR-011. Run locally, then COMMIT the registry diff; the daily
 * pipeline's check step self-clears once the fresh file lands.
 *
 * Usage:
 *   npx tsx scripts/update-closing-date-registry.ts                # derive + append
 *   npx tsx scripts/update-closing-date-registry.ts --dry-run
 *   npx tsx scripts/update-closing-date-registry.ts --set 2026-02=2026-03-05
 *   npx tsx scripts/update-closing-date-registry.ts --no-derive --set ...
 *     (--no-derive skips the GCS read entirely — offline manual entries)
 *
 * Env: GCS_BUCKET (default toast-stats-data-staging), WINDOW_DAYS (default 130).
 * Logging to stderr, JSON summary to stdout (R4).
 */

import * as path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { ClosingDateRegistry } from '../packages/collector-cli/src/utils/ClosingDateRegistry.js'
import {
  readRecentRawCSVEntries,
  RAW_CSV_DEFAULT_BUCKET,
  RAW_CSV_DEFAULT_WINDOW,
} from './lib/gcsHelpers.js'
import {
  deriveCompletedClosingMonths,
  parseManualEntryArg,
  planRegistryUpdates,
  type RegistryMonthEntry,
} from './lib/registryFreshness.js'

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
  const bucket = process.env.GCS_BUCKET ?? RAW_CSV_DEFAULT_BUCKET
  const windowDays = Number(process.env.WINDOW_DAYS ?? RAW_CSV_DEFAULT_WINDOW)
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

  let derived: RegistryMonthEntry[] = []
  if (!noDerive) {
    const entries = await readRecentRawCSVEntries(
      new Storage(),
      bucket,
      windowDays,
      log
    )
    derived = deriveCompletedClosingMonths(entries)
    log(`derived ${derived.length} completed closing months from metadata`)
  }

  const plan = planRegistryUpdates(before.months, derived, manualEntries)

  for (const update of plan) {
    const detail =
      update.action === 'add'
        ? `add ${update.dataMonth} → ${update.closingDate}`
        : `update ${update.dataMonth} → ${update.closingDate} (was ${update.previous})`
    if (dryRun) {
      log(`[dry-run] would ${detail} (${update.source})`)
    } else {
      await registry.append({
        dataMonth: update.dataMonth,
        closingDate: update.closingDate,
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        bucket,
        derivedCount: derived.length,
        manualCount: manualEntries.length,
        applied: plan,
        totalMonths: dryRun
          ? before.months.length
          : (await registry.read()).months.length,
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
