/**
 * Per-district analytics files compute no longer writes (#1798).
 *
 * Nothing read them: each was a re-serialisation of `analytics` or carried
 * content no surface consumed. Only `analytics` and `performance-targets`
 * are still written. Production keeps its old copies on already-promoted
 * dates until a separately approved cleanup, so the date-completeness gate
 * (#1761) must not count them — otherwise any rebuild of such a date holds.
 */
export const RETIRED_ANALYTICS_TYPES = [
  'membership',
  'clubhealth',
  'membership-analytics',
  'vulnerable-clubs',
  'leadership-insights',
  'distinguished-analytics',
  'year-over-year',
  'club-trends-index',
] as const

export type RetiredAnalyticsType = (typeof RETIRED_ANALYTICS_TYPES)[number]

const RETIRED_FILE = new RegExp(
  `^analytics/district_[A-Za-z0-9]+_(?:${RETIRED_ANALYTICS_TYPES.join('|')})\\.json$`
)

/**
 * True when `name` (relative to `snapshots/<date>/`) is a retired
 * per-district analytics file. Exact names only.
 */
export function isRetiredAnalyticsFile(name: string): boolean {
  return RETIRED_FILE.test(name)
}
