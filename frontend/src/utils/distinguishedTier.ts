/**
 * Toastmasters DCP "Club Distinguished Status" tier codes → display names.
 *
 * Codes are stable domain values (`'' | D | S | P | M`) set by Toastmasters;
 * this mirrors the private `TIER_NAMES` in analytics-core's `diffSnapshots`.
 * One frontend home so the "What Changed" table and its CSV export can't drift
 * apart (lesson 117 — diverged copies of the same map are a trap). The empty
 * code means "no distinguished status" → "None".
 */
const TIER_NAMES: Record<string, string> = {
  D: 'Distinguished',
  S: 'Select Distinguished',
  P: "President's Distinguished",
  M: 'Smedley Distinguished',
}

export function distinguishedTierName(code: string): string {
  if (!code) return 'None'
  return TIER_NAMES[code] ?? 'Distinguished'
}

/** Canonical Toastmasters distinguished tier codes (empty status excluded). */
export type ClubTierCode = 'D' | 'S' | 'P' | 'M'

const LETTER_CODES: ReadonlySet<string> = new Set<ClubTierCode>([
  'D',
  'S',
  'P',
  'M',
])

/**
 * Normalize a raw `distinguishedStatus` value to a canonical letter code.
 *
 * Historical snapshots sometimes carry the tier as a word form instead of a
 * letter code (`distinguishedStatus` may be either; see `ClubStatisticsFile`).
 * The classification is **substring-based**, not an exact-match lookup: the
 * dashboard's documented word form has no apostrophe ("Presidents
 * Distinguished" — `TOASTMASTERS_DASHBOARD_KNOWLEDGE.md:521`), so a keyed map
 * silently dropped every historical President's-Distinguished year (#1431).
 *
 * This mirrors `classifyDistinguishedTier` in analytics-core
 * (`packages/analytics-core/src/analytics/ClubEligibilityUtils.ts`) line for
 * line. It is a mirror rather than a delegation because that function is not
 * re-exported from the package root and the package's `exports` map has no
 * subpath entry. The shared-table test in `__tests__/distinguishedTier.test.ts`
 * asserts the two agree on every input — lesson 117's real bite here was
 * drifting from the *other implementation of the same rule*, not from the
 * code→name map next door. Keep the two in lockstep.
 *
 * Returns null for an absent, empty, or non-distinguished value (→ em-dash).
 */
export function normalizeTierCode(raw?: string): ClubTierCode | null {
  if (!raw) return null

  const code = raw.trim().toUpperCase()
  if (LETTER_CODES.has(code)) return code as ClubTierCode

  const words = raw.toLowerCase()
  if (!words.includes('distinguished')) return null
  if (words.includes('not distinguished')) return null
  if (words.includes('smedley')) return 'M'
  if (words.includes('president')) return 'P'
  if (words.includes('select')) return 'S'
  return 'D'
}
