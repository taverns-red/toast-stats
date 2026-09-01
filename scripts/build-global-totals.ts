/**
 * Worldwide-rollup backfill runner (#1498, epic #1496).
 *
 * Builds `global-totals.json` for ONE already-published snapshot date, from
 * the district files and `all-districts-rankings.json` sitting in a local
 * directory. The daily pipeline gets the same artifact from
 * `compute-analytics`; this exists for the historical dates that will never
 * be recomputed — the five program-year ends and the five March 31s the
 * 5-year history (Sprint 3) reads.
 *
 * Thin glue only. Every rule it depends on — scope to the date's own district
 * set, count each club once, Smedley absent before PY 2025-26, the
 * unknown-country residual — lives in
 * `packages/analytics-core/src/rollup/` and is unit-tested there.
 *
 * The date is REQUIRED and is not inferred from the directory name: the
 * program-year window for charter/suspension counting keys on it, and a
 * silently wrong window would produce a plausible wrong number.
 *
 * R4: logs go to stderr; the artifact goes to the file, and a one-line JSON
 * summary goes to stdout so a workflow can `| jq` it.
 *
 * Usage:
 *   npx tsx scripts/build-global-totals.ts --snapshot-dir ./cache/snapshots/2026-06-30 --date 2026-06-30
 *
 * INCOMPLETE INPUT IS REFUSED. If the date's district set lists a district
 * whose file did not arrive, the rollup's club, payment and membership sums
 * are understated while `paidClubs` and the tier counts — which come from the
 * rankings rows — stay whole. That is the silent-failure shape this epic
 * exists to avoid: a plausible worldwide number that is wrong. The GCS sync
 * that feeds this is fail-soft (`|| true`, R2), so "the download half-failed"
 * is a real and quiet possibility; the artifact is not written unless every
 * listed district supplied a file. `--allow-missing-districts` overrides for a
 * date an operator has REVIEWED, and says so loudly in the log.
 *
 * Exit codes: 0 = written · 1 = build failed or input incomplete ·
 * 2 = usage or setup error.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GLOBAL_TOTALS_FILE_NAME } from '@taverns-red/shared-contracts'
import {
  buildGlobalTotals,
  readSnapshotRankings,
  readSnapshotRollupInput,
} from '../packages/analytics-core/src/rollup/index.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function main(): void {
  const snapshotDir = readFlag('snapshot-dir')
  const date = readFlag('date')

  if (!snapshotDir || !date) {
    log(
      'Usage: build-global-totals.ts --snapshot-dir <dir> --date <YYYY-MM-DD> [--out <path>]'
    )
    process.exit(2)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    log(`--date must be YYYY-MM-DD, got: ${date}`)
    process.exit(2)
  }
  if (!existsSync(snapshotDir)) {
    log(`snapshot directory does not exist: ${snapshotDir}`)
    process.exit(2)
  }
  // Without the date's own district set there is nothing to scope to, and an
  // unscoped rollup is refused rather than guessed at (#1466, R17).
  if (!existsSync(join(snapshotDir, 'all-districts-rankings.json'))) {
    log(
      `no all-districts-rankings.json in ${snapshotDir} — cannot scope the rollup`
    )
    process.exit(2)
  }

  const outPath = readFlag('out') ?? join(snapshotDir, GLOBAL_TOTALS_FILE_NAME)
  const allowMissing = process.argv.includes('--allow-missing-districts')

  try {
    const rankings = readSnapshotRankings(snapshotDir)
    const input = readSnapshotRollupInput(snapshotDir, date)
    const totals = buildGlobalTotals({
      snapshotDate: date,
      districts: input.districts,
      rankings,
    })

    const missing = totals.districts.missingDistricts
    if (missing.length > 0 && !allowMissing) {
      log(
        `::error::${date}: ${missing.length} of ${totals.districts.total} listed ` +
          `district(s) supplied no file — refusing to publish an understated ` +
          `rollup. Missing: ${missing.join(', ')}. ` +
          `Re-run the sync, or pass --allow-missing-districts if this date is ` +
          `known to be incomplete.`
      )
      process.exit(1)
    }
    if (missing.length > 0) {
      log(
        `::warning::${date}: OVERRIDDEN by --allow-missing-districts — ` +
          `${missing.length} district(s) had no file, so club, payment and ` +
          `membership sums are understated: ${missing.join(', ')}`
      )
    }

    writeFileSync(outPath, JSON.stringify(totals, null, 2) + '\n', 'utf-8')

    log(
      `${date}: ${totals.districts.total} districts, ` +
        `${totals.membership.clubsCounted} clubs, ` +
        `${totals.membership.totalPayments} payments, ` +
        `${totals.membership.totalMembership} members`
    )
    // Contamination is reported, never swallowed — a non-empty list means the
    // directory holds districts the date never had (#1465).
    if (totals.districts.excludedDistricts.length > 0) {
      log(
        `  excluded ${totals.districts.excludedDistricts.length} out-of-set district file(s): ` +
          totals.districts.excludedDistricts.join(', ')
      )
    }
    if (totals.districts.duplicateClubs.length > 0) {
      log(
        `  ::warning::${totals.districts.duplicateClubs.length} club(s) appeared under two in-scope districts`
      )
    }

    process.stdout.write(
      JSON.stringify({
        date: totals.date,
        programYear: totals.programYear,
        path: outPath,
        districts: totals.districts.total,
        clubs: totals.membership.clubsCounted,
        payments: totals.membership.totalPayments,
        membership: totals.membership.totalMembership,
        excludedDistricts: totals.districts.excludedDistricts.length,
        duplicateClubs: totals.districts.duplicateClubs.length,
      }) + '\n'
    )
    process.exit(0)
  } catch (error) {
    log(
      `::error::failed to build ${GLOBAL_TOTALS_FILE_NAME} for ${date}: ` +
        (error instanceof Error ? error.message : 'unknown error')
    )
    process.exit(1)
  }
}

main()
