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
 * - **The timelines it names too** (#2591): the index's `timelines[].prefix`
 *   rows name PY prefixes; the entity files staging holds under them
 *   (`world.json`, `region-<n>.json`, `district-<id>.json`, nothing else)
 *   go between the years and the index. An index without `timelines` plans
 *   exactly as before.
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
  EDUCATION_TIMELINE_PREFIX,
  parseEducationTimelinePath,
} from '@taverns-red/shared-contracts'

export const EDUCATION_ROLLUP_STAGE = 'education-rollup'

/** A per-PY object directly under the prefix. */
export const EDUCATION_ROLLUP_YEAR_PATH = new RegExp(
  `^${EDUCATION_ROLLUP_PREFIX}/\\d{4}-\\d{4}\\.json$`
)

/**
 * A timeline entity file (#2591): `derived/education-timeline/<PY>/world.json`,
 * `region-<n>.json` or `district-<id>.json`. It promotes with the rollup,
 * under the rollup's rules, because the rollup index names its PY prefix.
 * Anything else under the prefix is not one.
 */
export function isEducationTimelineObject(path: string): boolean {
  return parseEducationTimelinePath(path) !== null
}

/** `derived/education-timeline/<PY>`: the prefix an index row names. */
const TIMELINE_PREFIX_ROW = new RegExp(
  `^${EDUCATION_TIMELINE_PREFIX}/(\\d{4}-\\d{4})$`
)

export function isEducationRollupObject(path: string): boolean {
  return (
    path === EDUCATION_ROLLUP_INDEX_PATH ||
    EDUCATION_ROLLUP_YEAR_PATH.test(path) ||
    isEducationTimelineObject(path)
  )
}

export interface EducationRollupInputs {
  /** Staging's index.json, or null when staging has none. */
  stagingIndex: string | null
  /** Prod's index.json, or null when prod has none. */
  prodIndex: string | null
  /** The dates prod's v1/dates.json indexes. */
  prodIndexedDates: readonly string[]
  /**
   * Every object staging holds under the PY prefixes the index names (the
   * caller lists `timelinePrefixes(stagingIndex)`). Only those matching the
   * three entity name patterns, under a named prefix, are promoted.
   */
  timelineObjects?: readonly string[]
}

export interface EducationRollupPlan {
  action: 'none' | 'held' | 'current' | 'promote'
  asOf: string | null
  /** The objects to promote, the index last; empty unless `promote`. */
  paths: string[]
  reason: string
}

/**
 * The timeline PY prefixes an index names (`timelines[].prefix`), sorted.
 * Throws on a row that names anything but `derived/education-timeline/<PY>`.
 */
export function timelinePrefixes(indexText: string): string[] {
  const index = JSON.parse(indexText) as { timelines?: unknown }
  if (index?.timelines === undefined) return []
  if (!Array.isArray(index.timelines)) {
    throw new Error(
      `staging ${EDUCATION_ROLLUP_INDEX_PATH} timelines is not an array`
    )
  }
  const out = new Set<string>()
  for (const row of index.timelines as Array<{ prefix?: unknown }>) {
    const p = row?.prefix
    if (typeof p !== 'string' || !TIMELINE_PREFIX_ROW.test(p)) {
      throw new Error(
        `staging ${EDUCATION_ROLLUP_INDEX_PATH} names timeline '${String(p)}', not ${EDUCATION_TIMELINE_PREFIX}/<PY>; refusing`
      )
    }
    out.add(p)
  }
  return [...out].sort()
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
  // The timelines it names (#2591): the entity files staging holds under the
  // named PY prefixes, and only those matching the three name patterns.
  const named = new Set(timelinePrefixes(inputs.stagingIndex))
  const timelines = (inputs.timelineObjects ?? []).filter(p => {
    const e = parseEducationTimelinePath(p)
    return (
      e !== null && named.has(`${EDUCATION_TIMELINE_PREFIX}/${e.programYear}`)
    )
  })
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
    paths: [...new Set(years)]
      .sort()
      .concat([...new Set(timelines)].sort(), EDUCATION_ROLLUP_INDEX_PATH),
    reason: `${new Set(years).size} program year(s) + ${new Set(timelines).size} timeline file(s) + index, reports as of ${asOf}`,
  }
}

/**
 * Where the sidecar verdict stands on the content gate: `none` when the
 * plan had no sidecar to gate, `pending` until `--apply-content-gate` has
 * applied the gate's per-date hold (#2227), then `applied`.
 */
export type SidecarContentGateState = 'none' | 'pending' | 'applied'

/** The part of the sidecar verdict the rollup's date hold reads. */
export interface SidecarHoldState {
  heldDates: readonly string[]
  contentGate?: SidecarContentGateState
}

/**
 * Hold the rollup with its reports date (#2222 review M2, L1). The rollup
 * is read from staging's reports of `asOf`. When the sidecars hold that
 * date, because this run wrote it and did not promote it or because one of
 * its reports failed the content gate, a rollup built from those reports
 * must not ship ahead of them. Another date's hold does not touch it.
 *
 * Fails closed: no sidecar verdict (the sidecar plan failed), a content
 * gate that was planned and never applied, or a rollup with no `asOf`
 * holds it. A later run plans it again. Returns the reason, or null.
 */
export function educationRollupDateHold(
  asOf: string | null,
  sidecar: SidecarHoldState | null
): string | null {
  if (asOf === null) return 'it names no reports date (asOf)'
  if (sidecar === null) {
    return 'there is no sidecar verdict to say whether its reports date is held'
  }
  if (sidecar.contentGate !== 'none' && sidecar.contentGate !== 'applied') {
    return `the sidecars' content gate was not applied, so it is unknown whether ${asOf} is held`
  }
  if (sidecar.heldDates.includes(asOf)) {
    return `its reports date ${asOf} is held: its sidecars stay in staging, so the rollup built from them does too`
  }
  return null
}
