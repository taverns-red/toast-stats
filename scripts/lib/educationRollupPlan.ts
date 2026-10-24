/**
 * The education rollup's place in the report-sidecar manifest — the plan
 * (#2222, ADR-015 step 9 follow-up; data from #1801, rules from #1810).
 *
 * build-education-rollup.sh writes `derived/education-rollup/<PY>.json` and
 * `index.json` to staging in the `education-rollup` job, after the pipeline
 * job promoted. It used to reach prod through mirror-education-rollup.sh, a
 * bucket-to-bucket copy outside every gate. Now the `promote-reports` job
 * adds it to the sidecar manifest, so the content gate reads every object
 * and scripts/promote-run-manifest.ts (`--education-rollup`) copies it. This
 * keeps the mirror's rules:
 *
 * - **Only what the index names**: the per-PY objects staging's index lists
 *   (each must be `derived/education-rollup/<PY>.json`), then the index.
 *   A stray object under the prefix is never promoted. The promoter copies
 *   the years first and the index LAST, so prod never names a year it does
 *   not hold (R15).
 * - **Held until its reports date is in prod**: a rollup whose `asOf` (the
 *   reports date it was read from) is not a date prod's v1/dates.json
 *   indexes, or that has none, is held: a rollup of a held day's reports
 *   must not ship ahead of that day. A later run plans it again once the
 *   day promotes.
 * - **Nothing new, nothing planned**: when prod's index is byte-identical
 *   to staging's (the build is deterministic), prod already has it.
 *
 * The plan reads staging, not the run manifest: the build of a held run is
 * still staging's rollup when a later run promotes its day. Pure; the I/O
 * is in ./reportSidecarPlanRunner.ts.
 */

import {
  EDUCATION_ROLLUP_INDEX_PATH,
  EDUCATION_ROLLUP_PREFIX,
} from '@taverns-red/shared-contracts'

export const EDUCATION_ROLLUP_STAGE = 'education-rollup'

/** A per-PY object directly under the prefix. */
export const EDUCATION_ROLLUP_YEAR_PATH = new RegExp(
  `^${EDUCATION_ROLLUP_PREFIX}/\\d{4}-\\d{4}\\.json$`
)

export function isEducationRollupObject(path: string): boolean {
  return (
    path === EDUCATION_ROLLUP_INDEX_PATH ||
    EDUCATION_ROLLUP_YEAR_PATH.test(path)
  )
}

export interface EducationRollupInputs {
  /** Staging's index.json, or null when staging has none. */
  stagingIndex: string | null
  /** Prod's index.json, or null when prod has none. */
  prodIndex: string | null
  /** The dates prod's v1/dates.json indexes. */
  prodIndexedDates: readonly string[]
}

export interface EducationRollupPlan {
  action: 'none' | 'held' | 'current' | 'promote'
  asOf: string | null
  /** The objects to promote, the index last; empty unless `promote`. */
  paths: string[]
  reason: string
}

/** Throws on an index that is not JSON or names anything off the prefix. */
export function planEducationRollup(
  inputs: EducationRollupInputs
): EducationRollupPlan {
  if (inputs.stagingIndex === null) {
    return {
      action: 'none',
      asOf: null,
      paths: [],
      reason: 'staging has no education rollup',
    }
  }
  const index = JSON.parse(inputs.stagingIndex) as {
    asOf?: unknown
    programYears?: unknown
  }
  if (!Array.isArray(index?.programYears)) {
    throw new Error(
      `staging ${EDUCATION_ROLLUP_INDEX_PATH} has no programYears[]`
    )
  }
  const years: string[] = []
  for (const row of index.programYears as Array<{ path?: unknown }>) {
    const p = row?.path
    if (typeof p !== 'string' || !EDUCATION_ROLLUP_YEAR_PATH.test(p)) {
      throw new Error(
        `staging ${EDUCATION_ROLLUP_INDEX_PATH} names '${String(p)}', outside ${EDUCATION_ROLLUP_PREFIX}/<PY>.json; refusing`
      )
    }
    years.push(p)
  }
  const asOf = typeof index.asOf === 'string' ? index.asOf : null
  if (asOf === null || !inputs.prodIndexedDates.includes(asOf)) {
    return {
      action: 'held',
      asOf,
      paths: [],
      reason: `its reports date (${asOf ?? 'none'}) is not a date prod indexes`,
    }
  }
  if (inputs.prodIndex === inputs.stagingIndex) {
    return {
      action: 'current',
      asOf,
      paths: [],
      reason: `prod already has staging's (as of ${asOf})`,
    }
  }
  return {
    action: 'promote',
    asOf,
    paths: [...new Set(years)].sort().concat(EDUCATION_ROLLUP_INDEX_PATH),
    reason: `${new Set(years).size} program year(s) + index, reports as of ${asOf}`,
  }
}

/** The part of the sidecar verdict the rollup's date hold reads. */
export interface SidecarHoldState {
  heldDates: readonly string[]
  contentGate?: string
}

/** Red stub (#2222 M2): never holds. */
export function educationRollupDateHold(
  _asOf: string | null,
  _sidecar: SidecarHoldState | null
): string | null {
  return null
}
