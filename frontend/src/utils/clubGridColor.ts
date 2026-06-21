import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { getLatestDcpGoals } from './columnFilterUtils'
import {
  getClubHealthStatusIcon,
  getClubHealthStatusLabel,
} from './clubHealthStatus'

/**
 * Pure colour/label mapping for the at-a-glance club grid (#1230, epic #1228).
 *
 * One tile per club; the tile fill is keyed either on club HEALTH (default) or
 * on Distinguished TIER. Both signals already live on `ClubTrend` — health via
 * `currentStatus`, tier via the per-club `distinguishedLevel` (the authoritative
 * source, NOT the season-gated `totals.distinguished*` aggregate — Lesson 123).
 *
 * Colour is never the only signal (WCAG 1.4.1): every tile also carries a
 * textual `statusLabel` (→ aria-label) and a non-colour `signalGlyph`, plus the
 * `{n}/10` DCP `signalText`. This module is the unit-testable heart of the
 * feature — it has no React/DOM dependency.
 */

export type GridColorMode = 'health' | 'tier'

/** The canonical, ordered list of colour modes (drives the toggle + legend). */
export const GRID_COLOR_MODES: readonly GridColorMode[] = ['health', 'tier']

/**
 * Clamp an arbitrary URL value to a valid colour mode. The `?color` param is
 * URL-seedable, so a shared/hand-edited link is an unguarded write path — the
 * whitelist must live at the parse where every entry path converges (a typed
 * URL, the back button, and the toggle click are all judged here), not on the
 * toggle handler alone (Lessons 124, 144 / R17). Unknown ⇒ the 'health' default.
 */
export function parseColorMode(raw: string | null | undefined): GridColorMode {
  return raw === 'tier' ? 'tier' : 'health'
}

export interface TileVisual {
  /** CSS modifier class controlling the tile's fill + text colour. */
  modifierClass: string
  /** The non-colour DCP signal shown on the tile, e.g. '7/10'. */
  signalText: string
  /** Short non-colour glyph reinforcing the status (✓/⚠/✗, D/S/P/M/—, ⊘). */
  signalGlyph: string
  /** Human-readable status for the tile's aria-label / tooltip. */
  statusLabel: string
}

/** Confirmed Distinguished tiers (everything except NotDistinguished). */
type ConfirmedTier = Exclude<
  ClubTrend['distinguishedLevel'],
  'NotDistinguished'
>

/** Tier → tile modifier. Mirrors `clubsColumns` TIER_MODIFIER (same colours,
 *  tile-scoped class names) so the two surfaces read identically (Lesson 052). */
const TIER_MODIFIER: Record<ConfirmedTier, string> = {
  Distinguished: 'club-grid-tile--tier-distinguished',
  Select: 'club-grid-tile--tier-select',
  President: 'club-grid-tile--tier-presidents',
  Smedley: 'club-grid-tile--tier-smedley',
}

/** Tier → single-letter glyph (the raw TI "Club Distinguished Status" codes). */
const TIER_GLYPH: Record<ConfirmedTier, string> = {
  Distinguished: 'D',
  Select: 'S',
  President: 'P',
  Smedley: 'M',
}

/** Tier → display label. Mirrors `clubsColumns` TIER_DISPLAY. */
const TIER_LABEL: Record<ConfirmedTier, string> = {
  Distinguished: 'Distinguished',
  Select: 'Select',
  President: "President's",
  Smedley: 'Smedley',
}

const HEALTH_MODIFIER: Record<ClubTrend['currentStatus'], string> = {
  thriving: 'club-grid-tile--thriving',
  vulnerable: 'club-grid-tile--vulnerable',
  'intervention-required': 'club-grid-tile--intervention',
}

/** Health statuses in the order the legend lists them (best → worst). */
const HEALTH_LEGEND_ORDER: ClubTrend['currentStatus'][] = [
  'thriving',
  'vulnerable',
  'intervention-required',
]

/** Confirmed tiers in the order the legend lists them (best → entry). */
const TIER_LEGEND_ORDER: ConfirmedTier[] = [
  'President',
  'Select',
  'Distinguished',
  'Smedley',
]

/** Descriptive legend labels (longer than the per-tile `statusLabel`). */
const TIER_LEGEND_LABEL: Record<ConfirmedTier, string> = {
  President: "President's Distinguished",
  Select: 'Select Distinguished',
  Distinguished: 'Distinguished',
  Smedley: 'Smedley (10/10)',
}

export interface LegendItem {
  modifierClass: string
  glyph: string
  label: string
}

const NOT_DISTINGUISHED_LEGEND: LegendItem = {
  modifierClass: 'club-grid-tile--tier-none',
  glyph: '—',
  label: 'Not yet Distinguished',
}

const SUSPENDED_LEGEND: LegendItem = {
  modifierClass: 'club-grid-tile--suspended',
  glyph: '⊘',
  label: 'Suspended',
}

/**
 * The legend rows for a colour mode, derived from the SAME modifier/glyph maps
 * the tiles use — so legend and grid can never drift (adding a tier or status
 * is a single-file edit here, not parallel edits in the legend component). The
 * Suspended row is always last because suspended tiles appear in both modes.
 */
export function getLegendItems(mode: GridColorMode): LegendItem[] {
  if (mode === 'tier') {
    return [
      ...TIER_LEGEND_ORDER.map(tier => ({
        modifierClass: TIER_MODIFIER[tier],
        glyph: TIER_GLYPH[tier],
        label: TIER_LEGEND_LABEL[tier],
      })),
      NOT_DISTINGUISHED_LEGEND,
      SUSPENDED_LEGEND,
    ]
  }
  return [
    ...HEALTH_LEGEND_ORDER.map(status => ({
      modifierClass: HEALTH_MODIFIER[status],
      glyph: getClubHealthStatusIcon(status),
      label: getClubHealthStatusLabel(status),
    })),
    SUSPENDED_LEGEND,
  ]
}

function isSuspended(club: ClubTrend): boolean {
  return club.clubStatus?.toLowerCase() === 'suspended'
}

function dcpSignalText(club: ClubTrend): string {
  const goals = Math.max(0, Math.min(10, getLatestDcpGoals(club)))
  return `${goals}/10`
}

/**
 * Resolve the tile's colour modifier, glyph, status label and DCP signal for a
 * club under the active colour mode. A suspended club is an operational override
 * that wins over both health and tier in either mode (its health/tier is moot).
 */
export function getTileVisual(
  club: ClubTrend,
  mode: GridColorMode
): TileVisual {
  const signalText = dcpSignalText(club)

  if (isSuspended(club)) {
    return {
      modifierClass: 'club-grid-tile--suspended',
      signalGlyph: '⊘',
      statusLabel: 'Suspended',
      signalText,
    }
  }

  if (mode === 'tier') {
    const level = club.distinguishedLevel
    if (level === 'NotDistinguished') {
      return {
        modifierClass: 'club-grid-tile--tier-none',
        signalGlyph: '—',
        statusLabel: 'Not yet Distinguished',
        signalText,
      }
    }
    return {
      modifierClass: TIER_MODIFIER[level],
      signalGlyph: TIER_GLYPH[level],
      statusLabel: TIER_LABEL[level],
      signalText,
    }
  }

  return {
    modifierClass: HEALTH_MODIFIER[club.currentStatus],
    signalGlyph: getClubHealthStatusIcon(club.currentStatus),
    statusLabel: getClubHealthStatusLabel(club.currentStatus),
    signalText,
  }
}
