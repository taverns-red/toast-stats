/**
 * The `discover-districts` stdout contract (#1343).
 *
 * The daily pipeline parses this JSON with `jq` and routes it into the
 * program-year rollover monitor. A field silently going missing does not fail
 * anything loudly — `jq -r '.reason // "unknown"'` just yields "unknown", and
 * the monitor then alerts on every single run. Building the payload in one
 * tested place keeps the two exit paths (success and no-districts) from
 * drifting apart, which is exactly how `reason` was almost shipped on only one
 * of them.
 */
import type { ProgramYearResolution } from './programYearResolver.js'

export interface DiscoveryOutput {
  date: string
  programYear: string
  fellBack: boolean
  reason: string
  /** Comma-separated district IDs — empty string when none were found. */
  districts: string
  count: number
}

export function buildDiscoveryOutput(
  date: string,
  resolution: ProgramYearResolution,
  districts: readonly string[]
): DiscoveryOutput {
  return {
    date,
    programYear: resolution.programYear,
    fellBack: resolution.fellBack,
    reason: resolution.reason,
    districts: districts.join(','),
    count: districts.length,
  }
}
