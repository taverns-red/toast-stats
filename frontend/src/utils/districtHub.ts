import type { MetricRankings, RecognitionTargets } from '../types/districts'

/* Pure formatting for the phone Overview hub tiles (#1842). Kept out of the
   component file so it stays a components-only module (fast refresh). */

const TIER_ORDER: { key: keyof RecognitionTargets; label: string }[] = [
  { key: 'distinguished', label: 'Distinguished' },
  { key: 'select', label: 'Select' },
  { key: 'presidents', label: "President's" },
  { key: 'smedley', label: 'Smedley' },
]

/**
 * The tile's "delta": how far the district is from its next recognition
 * tier ("23 to Distinguished"), or "Smedley reached" at the top. Null when the
 * targets file has no row for this district — the tile then shows a dash.
 */
export function nextTierText(
  current: number,
  targets: RecognitionTargets | null
): string | null {
  if (!targets) return null
  const next = TIER_ORDER.find(t => current < targets[t.key])
  if (!next) return 'Smedley reached'
  return `${(targets[next.key] - current).toLocaleString()} to ${next.label}`
}

/** "#36 of 94" — world rank only; percentile and region live in the sheet. */
export function worldRankText(rankings: MetricRankings): string | null {
  return rankings.worldRank !== null && rankings.totalDistricts > 0
    ? `#${rankings.worldRank} of ${rankings.totalDistricts}`
    : null
}

/** Signed delta with a true minus sign: "+312", "−2,501", "0". */
export function formatSigned(n: number): string {
  if (n === 0) return '0'
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`
}

/**
 * The hub's layout switch: phones held upright (< 768) and phones on their
 * side (short landscape viewports, which are ≥ 768 wide on most handsets).
 * Tablets and desktops keep the KPI strip unchanged.
 */
export const DISTRICT_HUB_QUERY =
  '(max-width: 767px), (orientation: landscape) and (max-height: 500px)'
