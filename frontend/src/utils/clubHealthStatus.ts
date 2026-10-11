import type { ClubHealthStatus } from '../hooks/useDistrictAnalytics'

/**
 * Single source of truth for how a club's HEALTH status
 * (thriving / vulnerable / intervention-required) renders as a pill — the
 * display label and the `.clubs-status-pill--*` CSS modifier.
 *
 * Both the desktop ClubsTable row and the mobile ClubCard import these so the
 * same datum reads identically on both surfaces (lesson 052 — one definition,
 * not two). This is distinct from the OPERATIONAL club status
 * (active/suspended/ineligible).
 */

export function getClubHealthStatusLabel(status: ClubHealthStatus): string {
  switch (status) {
    case 'intervention-required':
      return 'Intervention Required'
    case 'vulnerable':
      return 'Vulnerable'
    default:
      return 'Thriving'
  }
}

/**
 * One-word label for space-constrained surfaces (#1833): the compact mobile
 * row has ~300 px for name + chip at 375 px, and "Intervention Required" would
 * leave the club name ~90 px. Always rendered with the status glyph, so the
 * meaning never rests on colour (WCAG 1.4.1); the full label stays the default.
 */
export function getClubHealthStatusShortLabel(
  status: ClubHealthStatus
): string {
  return status === 'intervention-required'
    ? 'Intervention'
    : getClubHealthStatusLabel(status)
}

export function getClubHealthStatusPillModifier(
  status: ClubHealthStatus
): string {
  switch (status) {
    case 'intervention-required':
      return 'clubs-status-pill--intervention'
    case 'vulnerable':
      return 'clubs-status-pill--vulnerable'
    default:
      return 'clubs-status-pill--thriving'
  }
}

/**
 * Decorative glyph that reinforces the health status with a non-colour cue.
 * Matches the ClubDetailPage DCP-outlook glyphs (✓ / ⚠ / ✗) so the same datum
 * reads consistently across surfaces. The text label carries the meaning; the
 * icon is `aria-hidden` at the render site (WCAG 1.4.1 — never colour alone).
 */
export function getClubHealthStatusIcon(status: ClubHealthStatus): string {
  switch (status) {
    case 'intervention-required':
      return '✗'
    case 'vulnerable':
      return '⚠'
    default:
      return '✓'
  }
}
