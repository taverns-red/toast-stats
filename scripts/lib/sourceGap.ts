/**
 * #1671 source gaps as a snapshot's `metadata.json` records them (#2038).
 *
 * When a district's club report is unusable (TI's HTML error page stored as
 * the CSV, no CSV, or a corrupt one), TransformService writes no
 * `district_<id>.json` and no analytics for it. It lists the district in
 * `failedDistricts` and records the reason in `errors[]` as
 * `<id>: Skipped: …`. No other transform error starts that way (#2035).
 *
 * Read-only helpers shared by the completeness gate and the one-off
 * gap-district prune.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []

/** The prefix TransformService gives a gap district's error line. */
export const gapErrorPrefix = (districtId: string): string =>
  `${districtId}: Skipped: `

/**
 * Districts the metadata lists as failed with a gap reason, and not also as
 * successful. A failure without a gap reason is not a gap.
 */
export function sourceGapDistricts(metadata: unknown): string[] {
  if (!isRecord(metadata)) return []
  const successful = new Set(strings(metadata.successfulDistricts))
  const errors = strings(metadata.errors)
  return [...new Set(strings(metadata.failedDistricts))].filter(
    id =>
      !successful.has(id) && errors.some(e => e.startsWith(gapErrorPrefix(id)))
  )
}

const DISTRICT_OBJECT =
  /^(?:analytics\/)?district_([A-Za-z0-9]+)(?:_[a-z-]+)?\.json$/

/**
 * The district a per-district object belongs to, from its name relative to
 * `snapshots/<date>/` (`district_<id>.json`, `analytics/district_<id>_*.json`).
 * Null for a date-level object.
 */
export function districtObjectId(relativeName: string): string | null {
  return DISTRICT_OBJECT.exec(relativeName)?.[1] ?? null
}
