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
 * Inverse of {@link TIER_NAMES} — historical snapshots sometimes carry the tier
 * as a word form instead of a letter code (`distinguishedStatus` may be either;
 * see `ClubStatisticsFile`). Kept beside the canonical code→name map so the two
 * directions can't drift apart (lesson 117).
 */
const WORD_FORM_TO_CODE: Record<string, ClubTierCode> = {
  distinguished: 'D',
  'select distinguished': 'S',
  "president's distinguished": 'P',
  'smedley distinguished': 'M',
}

/**
 * Normalize a raw `distinguishedStatus` value to a canonical letter code.
 * Returns null for an absent, empty, or unrecognised value (→ em-dash, never a
 * guess). Accepts both live letter codes and historical word forms.
 */
export function normalizeTierCode(raw?: string): ClubTierCode | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (LETTER_CODES.has(trimmed)) return trimmed as ClubTierCode
  return WORD_FORM_TO_CODE[trimmed.toLowerCase()] ?? null
}
