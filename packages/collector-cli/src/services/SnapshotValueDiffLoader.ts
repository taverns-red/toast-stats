/**
 * SnapshotValueDiffLoader — fs glue for {@link SnapshotValueDiff}. Loads per-date
 * digests from a snapshots directory tree (`{root}/{date}/all-districts-rankings.json`)
 * and orchestrates the diff + promote decision for the CLI `value-diff` command.
 *
 * The pure comparison logic lives in SnapshotValueDiff.ts (unit-tested without fs);
 * this module owns only the reading + orchestration.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateAllDistrictsRankings } from '@taverns-red/shared-contracts'
import {
  digestDate,
  diffSnapshots,
  evaluatePromote,
  type DateDigest,
  type PromoteDecision,
  type ValueDiffReport,
} from './SnapshotValueDiff.js'
import {
  planValueDiffFetch,
  type ValueDiffFetchPlan,
} from './SnapshotListingHashes.js'

const RANKINGS_FILE = 'all-districts-rankings.json'

export interface RunValueDiffOptions {
  stagingDir: string
  prodDir: string
  allowValueChanges?: boolean
  /** CPAA eligibility; false for non-daily pipeline runs (#1673). Default true. */
  closingAutoAllow?: boolean
  /**
   * Overlap dates not downloaded because their live object hashes match on
   * both sides (#1730). Byte-identical ⇒ equal digests, so each counts as an
   * unchanged overlap date — the report is what a full download would give.
   * A listed date that was downloaded anyway is judged by its digests.
   */
  hashEqualDates?: string[]
}

/** Read a newline-separated date list; blank lines are ignored. */
export function readDateList(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
}

/** Read a listing JSON file; missing or unparseable ⇒ undefined (unusable). */
function readListing(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

export interface LoadValueDiffFetchPlanOptions {
  overlapDatesFile: string
  stagingListingFile: string
  prodListingFile: string
}

/**
 * fs glue for {@link planValueDiffFetch} (CLI `value-diff-plan`). A missing
 * or unparseable listing file makes the plan fetch every overlap date.
 */
export function loadValueDiffFetchPlan(
  opts: LoadValueDiffFetchPlanOptions
): ValueDiffFetchPlan {
  return planValueDiffFetch(
    readDateList(opts.overlapDatesFile),
    readListing(opts.stagingListingFile),
    readListing(opts.prodListingFile)
  )
}

/**
 * Count hash-equal dates that were not downloaded on either side as
 * unchanged overlap dates, exactly as {@link diffSnapshots} would have.
 */
function withHashEqualDates(
  report: ValueDiffReport,
  staging: DateDigest[],
  prod: DateDigest[],
  hashEqualDates: string[]
): ValueDiffReport {
  const loaded = new Set([...staging, ...prod].map(d => d.date))
  const extra = [...new Set(hashEqualDates)].filter(d => !loaded.has(d))
  if (extra.length === 0) return report
  return {
    ...report,
    unchanged: [...report.unchanged, ...extra].sort(),
    overlap: report.overlap + extra.length,
  }
}

export interface RunValueDiffResult {
  report: ValueDiffReport
  decision: PromoteDecision
  /** 0 when promotion is safe, 1 (PARTIAL_FAILURE) when blocked / requires review */
  exitCode: number
}

/**
 * Load one {@link DateDigest} per date directory under `root` that contains an
 * `all-districts-rankings.json`. The file is schema-validated (fail-closed: a
 * malformed snapshot throws rather than silently skipping a date — a safety gate
 * must not pass on data it could not read). A missing root yields `[]`.
 */
export function loadDateDigests(root: string): DateDigest[] {
  if (!existsSync(root)) return []

  const digests: DateDigest[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = join(root, entry.name, RANKINGS_FILE)
    if (!existsSync(file)) continue
    const parsed = validateAllDistrictsRankings(
      JSON.parse(readFileSync(file, 'utf8'))
    )
    if (!parsed.success || !parsed.data) {
      throw new Error(
        `Invalid ${RANKINGS_FILE} for ${entry.name}: ${parsed.error}`
      )
    }
    digests.push(digestDate(entry.name, parsed.data))
  }
  return digests
}

export function runValueDiff(opts: RunValueDiffOptions): RunValueDiffResult {
  const staging = loadDateDigests(opts.stagingDir)
  const prod = loadDateDigests(opts.prodDir)
  const report = withHashEqualDates(
    diffSnapshots(staging, prod),
    staging,
    prod,
    opts.hashEqualDates ?? []
  )
  const decision = evaluatePromote(
    report,
    {
      allowValueChanges: opts.allowValueChanges,
      closingAutoAllow: opts.closingAutoAllow,
    },
    // CPAA (#1086): digests carry the already-parsed rows + sourceCsvDate.
    { staging, prod }
  )
  return { report, decision, exitCode: decision.promote ? 0 : 1 }
}
