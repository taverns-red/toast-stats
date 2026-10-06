/**
 * Recognition registry (#1361) — the single description of the district
 * recognition vocabulary.
 *
 * "Recognition" is the umbrella the product owner chose (explicitly not
 * "Tier"), and it covers two structurally different families:
 *
 *   - the three **competitive awards**, which are INDEPENDENT of one another,
 *     so each gets its own glyph and its own accent; and
 *   - the four **Distinguished District tiers**, which are ORDINAL
 *     (Distinguished < Select < President's < Smedley), so they share one
 *     rosette glyph and differentiate by colour + label. Smedley keeps the
 *     rare-tier gold ring from #546.
 *   - the **threshold achievements** (#1537) — the District Club Growth
 *     Achievement, TI's PY 2026-27 charter milestones. Neither competitive
 *     (any number of districts can earn it; there is no race leader) nor a
 *     rung of the Distinguished ladder, so it is its own family with its own
 *     glyph. It also carries a legacy-chrome accent (`--tm-loyal-blue`), not a
 *     `--rt-*` one: new UI stays on the legacy tokens until Phase 2 (ops#37).
 *
 * Before this module the same vocabulary was described three times, in three
 * places that could drift: `AWARD_CARDS` in `AwardsRaceSection`, `TIER_CONFIG`
 * in `DistrictTierChip`, and three inline `🏆` chips in `DistrictsPage` (all
 * three the SAME emoji, which is the legibility bug this issue opened on).
 * Every consumer now reads from here. Adding a recognition item is one edit.
 *
 * Icons are inline SVG with `stroke="currentColor"`, not emoji: emoji render
 * differently per platform, can't be recoloured, and can't be themed.
 *
 * Filtering on these items is #1362 and builds on this registry — keep the
 * exported shapes stable and data-driven.
 */
import React from 'react'
import type {
  CompetitiveAwardsByDistrict,
  CompetitiveAwardStandings,
  DistinguishedDistrictTier,
} from '../../services/cdn'
import {
  CLUB_GROWTH_ACHIEVEMENT_FIRST_PROGRAM_YEAR,
  clubGrowthCheckpoints,
} from '../../utils/clubGrowthAchievement'

export type RecognitionIconProps = { className?: string }
export type RecognitionIcon = React.FC<RecognitionIconProps>

export type AwardRecognitionId = 'extension' | 'twentyPlus' | 'retention'
export type TierRecognitionId = Exclude<
  DistinguishedDistrictTier,
  'NotDistinguished' | 'Unknown'
>
export type AchievementRecognitionId = 'clubGrowth'
export type RecognitionId =
  AwardRecognitionId | TierRecognitionId | AchievementRecognitionId

/**
 * Keys on `CompetitiveAwardsByDistrict` that flag a winner. Derived from the
 * ids rather than restated, and intersected with the CDN type — so a renamed
 * or dropped flag on the wire is a compile error here rather than an award
 * badge that silently stops rendering.
 */
export type AwardWinnerFlagKey = Extract<
  keyof CompetitiveAwardsByDistrict,
  `${AwardRecognitionId}IsWinner`
>

/** Keys on `CompetitiveAwardStandings` holding a top-N standings array. */
export type AwardStandingsKey = keyof Pick<
  CompetitiveAwardStandings,
  'extensionAward' | 'twentyPlusAward' | 'retentionAward'
>

interface RecognitionBase {
  /** Short label rendered beside the icon at EVERY width (no sr-only). */
  shortLabel: string
  /** Full title — the badge's accessible name and the legend's term. */
  title: string
  /** One-line explanation for the legend. */
  description: string
  Icon: RecognitionIcon
  /**
   * CSS custom property carrying this item's accent, defined (light + dark)
   * in `styles/tokens/redesign.css` from the `--rt-*` brand tokens.
   */
  accentVar: string
}

export interface AwardRecognition extends RecognitionBase {
  kind: 'award'
  id: AwardRecognitionId
  winnerFlagKey: AwardWinnerFlagKey
  standingsKey: AwardStandingsKey
  /** Threshold sub-line for the Awards Race card. */
  threshold: string
  /** Format the leader's value for display (e.g. "+14", "94.1%"). */
  formatValue: (value: number) => string
  /** Progress 0-100 from the leader's value. */
  computeProgress: (value: number) => number
}

export interface TierRecognition extends RecognitionBase {
  kind: 'tier'
  id: TierRecognitionId
  /** Ordinal position, Distinguished (1) → Smedley (4). */
  order: number
  /** Smedley only — the rare-tier gold ring required by #546. */
  rare?: boolean
}

export interface AchievementRecognition extends RecognitionBase {
  kind: 'achievement'
  id: AchievementRecognitionId
  /** First program year the achievement exists (forward-only, #1473 A1/A5). */
  firstProgramYear: string
  /** Where the rule and our readings of it are documented. */
  methodologyHref: string
}

export type RecognitionItem =
  AwardRecognition | TierRecognition | AchievementRecognition

/* ── Glyphs ───────────────────────────────────────────────────────────────
   16x16, stroke-only, `currentColor` so the accent is applied by CSS. Each
   award reads as its own idea; the tiers deliberately share one rosette. */

/** Extension — upward arrow breaking out of a baseline: growth. */
export const GrowthIcon: RecognitionIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M2 13h12" />
    <path d="M8 11V3" />
    <path d="M4.5 6.5 8 3l3.5 3.5" />
  </svg>
)

/** 20-Plus — a cluster of people: club size. */
export const PeopleIcon: RecognitionIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="6" cy="5" r="2.3" />
    <path d="M1.8 13c0-2.3 1.9-3.8 4.2-3.8s4.2 1.5 4.2 3.8" />
    <path d="M11 4.2a2.1 2.1 0 0 1 0 4" />
    <path d="M12.1 9.6c1.3.5 2.1 1.6 2.1 3.4" />
  </svg>
)

/** Retention — a shield: holding on to what you have. */
export const ShieldIcon: RecognitionIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M8 1.8 13.2 3.6v4.1c0 3.1-2.1 5.4-5.2 6.5-3.1-1.1-5.2-3.4-5.2-6.5V3.6z" />
    <path d="m5.9 7.9 1.5 1.6 2.8-3" />
  </svg>
)

/**
 * All four tiers share this rosette. That is the point: the tiers are one
 * ordinal ladder, so giving each its own glyph would assert a difference in
 * KIND where there is only a difference in DEGREE. Colour + label carry the
 * degree.
 */
export const RosetteIcon: RecognitionIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="8" cy="6" r="4.2" />
    <path d="M8 3.9 8.7 5.3l1.5.2-1.1 1.1.26 1.5L8 7.4l-1.36.7.26-1.5-1.1-1.1 1.5-.2z" />
    <path d="M5.6 9.7 4.3 14.2l3.7-1.9 3.7 1.9-1.3-4.5" />
  </svg>
)

/**
 * Club Growth Achievement — a pennant on a pole: a milestone reached. Not an
 * arrow (Extension already owns "growth") and not the rosette (it is not a
 * Distinguished rung).
 */
export const MilestoneFlagIcon: RecognitionIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M4 14.2V1.8" />
    <path d="M4 2.6h8.4l-2.2 2.7 2.2 2.7H4" />
    <path d="M2 14.2h5" />
  </svg>
)

/* ── The registry ─────────────────────────────────────────────────────── */

export const AWARD_RECOGNITION: readonly AwardRecognition[] = [
  {
    kind: 'award',
    id: 'extension',
    winnerFlagKey: 'extensionIsWinner',
    standingsKey: 'extensionAward',
    title: "President's Extension Award",
    shortLabel: 'Extension',
    description: 'Most new paid clubs chartered against the prior year.',
    threshold: 'Most new paid clubs vs prior year',
    Icon: GrowthIcon,
    accentVar: '--recognition-extension',
    formatValue: v => (v >= 0 ? `+${v}` : `${v}`),
    // Winners are flagged separately; non-winners progress against a soft
    // target of 15 (the design's reference threshold).
    computeProgress: v => Math.min(100, Math.max(0, (v / 15) * 100)),
  },
  {
    kind: 'award',
    id: 'twentyPlus',
    winnerFlagKey: 'twentyPlusIsWinner',
    standingsKey: 'twentyPlusAward',
    title: "President's 20-Plus Award",
    shortLabel: '20-Plus',
    description: 'Highest share of paid clubs carrying 20 or more members.',
    threshold: '% of paid clubs with 20+ members',
    Icon: PeopleIcon,
    accentVar: '--recognition-twenty-plus',
    formatValue: v => `${v.toFixed(1)}%`,
    computeProgress: v => Math.min(100, Math.max(0, v)),
  },
  {
    kind: 'award',
    id: 'retention',
    winnerFlagKey: 'retentionIsWinner',
    standingsKey: 'retentionAward',
    title: 'District Club Retention Award',
    shortLabel: 'Retention',
    description: 'Kept at least 90% of last year’s clubs.',
    threshold: '90% retention of last year’s clubs',
    Icon: ShieldIcon,
    accentVar: '--recognition-retention',
    formatValue: v => `${v.toFixed(1)}%`,
    computeProgress: v => Math.min(100, Math.max(0, v)),
  },
]

export const TIER_RECOGNITION: readonly TierRecognition[] = [
  {
    kind: 'tier',
    id: 'Distinguished',
    order: 1,
    title: 'Distinguished District',
    shortLabel: 'Distinguished',
    description: 'Tier 1 — met the base Distinguished District goals.',
    Icon: RosetteIcon,
    accentVar: '--recognition-distinguished',
  },
  {
    kind: 'tier',
    id: 'Select',
    order: 2,
    title: 'Select Distinguished District',
    shortLabel: 'Select',
    description: 'Tier 2 — cleared the Select Distinguished thresholds.',
    Icon: RosetteIcon,
    accentVar: '--recognition-select',
  },
  {
    kind: 'tier',
    id: 'Presidents',
    order: 3,
    title: "President's Distinguished District",
    shortLabel: "President's",
    description: "Tier 3 — cleared the President's Distinguished thresholds.",
    Icon: RosetteIcon,
    accentVar: '--recognition-presidents',
  },
  {
    kind: 'tier',
    id: 'Smedley',
    order: 4,
    title: 'Smedley Distinguished District',
    shortLabel: 'Smedley',
    description: 'Tier 4 — the rarest tier, under ten districts a year.',
    Icon: RosetteIcon,
    accentVar: '--recognition-smedley',
    rare: true,
  },
]

/** `[3, 5]` → `"3 or 5"`, `[3, 5, 10]` → `"3, 5 or 10"`. */
const milestoneList = (milestones: readonly number[]): string =>
  milestones.length <= 1
    ? milestones.join('')
    : `${milestones.slice(0, -1).join(', ')} or ${milestones[milestones.length - 1]}`

/**
 * The description is BUILT from the predicate's own checkpoints (#1474), so
 * the legend and the verdict cannot disagree about the thresholds. The
 * milestones are TI's, quoted in `docs/toastmasters-rules-reference.md` §13.7.
 */
const clubGrowthDescription = (): string => {
  const [sep, mar] = clubGrowthCheckpoints(
    CLUB_GROWTH_ACHIEVEMENT_FIRST_PROGRAM_YEAR
  )!
  return (
    `Chartered ${milestoneList(sep!.milestones)} new clubs by September 30, ` +
    `or ${milestoneList(mar!.milestones)} by March 31 — ` +
    `from ${CLUB_GROWTH_ACHIEVEMENT_FIRST_PROGRAM_YEAR}.`
  )
}

export const CLUB_GROWTH_RECOGNITION: AchievementRecognition = {
  kind: 'achievement',
  id: 'clubGrowth',
  title: 'District Club Growth Achievement',
  shortLabel: 'Club Growth',
  description: clubGrowthDescription(),
  Icon: MilestoneFlagIcon,
  accentVar: '--recognition-club-growth',
  firstProgramYear: CLUB_GROWTH_ACHIEVEMENT_FIRST_PROGRAM_YEAR,
  methodologyHref: '/methodology#py-2026-2027-district-club-growth-achievement',
}

export const ACHIEVEMENT_RECOGNITION: readonly AchievementRecognition[] = [
  CLUB_GROWTH_RECOGNITION,
]

/** Awards first, then the tier ladder in ordinal order, then achievements. */
export const RECOGNITION_ITEMS: readonly RecognitionItem[] = [
  ...AWARD_RECOGNITION,
  ...TIER_RECOGNITION,
  ...ACHIEVEMENT_RECOGNITION,
]

/**
 * Tier titles alone, for a consumer that needs the words but not the badge —
 * `DistinguishedDistrictTrophyCase`'s `TIER_LABELS` held these four strings
 * verbatim. Its emoji ICONS deliberately stay local: podium medals in a
 * detail panel are a different visual language from a rosette badge in a
 * dense table, and that map also labels `Unknown` / `NotDistinguished`, which
 * this registry does not model (absence is the signal here).
 */
export const TIER_TITLES: Record<TierRecognitionId, string> = {
  Distinguished: 'Distinguished District',
  Select: 'Select Distinguished District',
  Presidents: "President's Distinguished District",
  Smedley: 'Smedley Distinguished District',
}

const TIER_BY_ID = new Map<TierRecognitionId, TierRecognition>(
  TIER_RECOGNITION.map(t => [t.id, t])
)

/**
 * Resolve a CDN tier value to its registry entry. `NotDistinguished`,
 * `Unknown`, null and undefined all resolve to `undefined` — absence is the
 * signal, the same convention the chip and the row `data-tier` hook use.
 */
export function tierRecognition(
  tier: DistinguishedDistrictTier | null | undefined
): TierRecognition | undefined {
  if (!tier) return undefined
  return TIER_BY_ID.get(tier as TierRecognitionId)
}
