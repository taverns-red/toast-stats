import React, { useState } from 'react'
import {
  districtTiersForProgramYear,
  requiredPrerequisitesForProgramYear,
  type DistrictRecognitionTier,
} from '@taverns-red/analytics-core'
import {
  deriveRemainingByTier,
  type RemainingInputs,
  type TierGapRow,
} from '../utils/distinguishedCountdown'
import { TIER_TITLES } from './recognition/recognitionRegistry'

export type DistinguishedDistrictTier =
  | 'Unknown'
  | 'NotDistinguished'
  | 'Distinguished'
  | 'Select'
  | 'Presidents'
  | 'Smedley'

export interface DistinguishedDistrictPrerequisites {
  dspSubmitted: boolean
  trainingMet: boolean
  marketAnalysisSubmitted: boolean
  communicationPlanSubmitted: boolean
  regionAdvisorVisitMet: boolean
}

export interface DistinguishedDistrictGap {
  tier: DistinguishedDistrictTier
  paymentGrowthGap: number
  clubGrowthGap: number
  distinguishedPercentGap: number
  netClubGrowthGap: number
  /** Program-year baselines, used as fallback inputs when canonical
      `*Remaining` fields are absent (#840 / lesson 104). */
  paidClubBase?: number
  paymentBase?: number
}

export interface DistinguishedDistrictStatus {
  districtId: string
  currentTier: DistinguishedDistrictTier
  allPrerequisitesMet: boolean
  prerequisites: DistinguishedDistrictPrerequisites
  nextTierGap: DistinguishedDistrictGap | null
  /** Canonical absolute counts remaining to the minimum (Distinguished)
      tier (#686). When `nextTierGap.tier === 'Distinguished'` these are
      the same integers the region row consumes — preferred over any
      ranking-row derivation. */
  paidClubsRemaining?: number
  paymentsRemaining?: number
  distinguishedClubsRemaining?: number
}

interface DistinguishedDistrictTrophyCaseProps {
  status: DistinguishedDistrictStatus | null
  /**
   * True while the competitive-awards query is still in flight (#1105).
   * That query resolves *separately from and later than* the page-analytics
   * query that paints DistrictDetailPage, so without a reserved slot the
   * panel pops in from 0px when the query lands and shoves everything below
   * it down — the AwardsRaceSection (#750) / Lesson 107 failure class. While
   * loading we render a height-matched skeleton so the real panel fills the
   * slot in place.
   */
  isLoading?: boolean
  /** The awards read is waiting for this card to near the viewport (#2513): show the still placeholder. */
  held?: boolean
  /**
   * Program year ("YYYY-YYYY") the status belongs to. Drives which
   * prerequisite rows the checklist renders — TI's required gates change
   * by year (e.g. Region Advisor Visit retired for 2026-27, #1344) while
   * `status.prerequisites` deliberately keeps emitting the legacy
   * 5-boolean shape for every era (#1354).
   *
   * REQUIRED. It was optional, falling back to every legacy gate, and that
   * fallback was unreachable in production — the one caller always passes a
   * year. What it actually bought was the ability to render a per-year
   * checklist with no year and silently get the 2025-26 shape, which is the
   * failure class this component exists to prevent. A caller without a
   * resolved year passes the year it is DISPLAYING rather than omitting.
   */
  programYear: string
  /** Optional rankings row used to derive the absolute remaining counts
      when the canonical fields are absent or the next tier is above
      Distinguished. Matches the region page's data source. */
  ranking?: RemainingInputs | null
  clubStrengthQualifies?: boolean | undefined
  clubStrengthGrowth?: number | null | undefined
  leadershipExcellenceQualifies?: boolean | undefined
  leadershipExcellenceYears?: number | undefined
  /** Mid-year: 2+ prior consecutive Distinguished years and currently
      tracking Distinguished — awarded only at the year-end close (#1609). */
  leadershipExcellenceOnTrack?: boolean | undefined
  educationTrainingQualifies?: boolean | undefined
  clubGrowthQualifies?: boolean | undefined
}

/* The four achieved-tier titles come from the shared recognition registry
   (#1361) — they were duplicated here verbatim. The two non-achieved states
   stay local: the registry models achieved recognition only (absence is its
   signal), and this panel is the one place that has to name "not yet". */
const TIER_LABELS: Record<DistinguishedDistrictTier, string> = {
  Unknown: 'Recognition Unknown',
  NotDistinguished: 'Not Yet Distinguished',
  ...TIER_TITLES,
}

const TIER_BADGE_STYLES: Record<DistinguishedDistrictTier, string> = {
  Unknown: 'bg-gray-50 text-gray-500 border-gray-200',
  NotDistinguished: 'bg-gray-100 text-gray-700 border-gray-300',
  Distinguished: 'bg-tm-true-maroon text-white border-tm-true-maroon',
  Select: 'bg-tm-cool-gray text-gray-900 border-gray-400',
  Presidents:
    'bg-tm-happy-yellow text-gray-900 border-yellow-500 font-semibold',
  Smedley: 'bg-purple-100 text-purple-900 border-purple-400 font-semibold',
}

const TIER_ICONS: Record<DistinguishedDistrictTier, string> = {
  Unknown: '◌',
  NotDistinguished: '○',
  Distinguished: '🥉',
  Select: '🥈',
  Presidents: '🥇',
  Smedley: '🏆',
}

const PREREQUISITE_LABELS: Record<
  keyof DistinguishedDistrictPrerequisites,
  string
> = {
  dspSubmitted: 'District Success Plan submitted',
  trainingMet: '85% Director training complete',
  marketAnalysisSubmitted: 'Market Analysis Plan submitted',
  communicationPlanSubmitted: 'Communication Plan submitted',
  regionAdvisorVisitMet: '2+ Region Advisor meetings',
}

/* PREREQUISITE_KEYS — the "every legacy gate" fallback list — was deleted
   with the optional `programYear` prop (#1354). The visible rows come from
   `requiredPrerequisitesForProgramYear`, which is the only thing that knows
   which gates a given year actually requires. PREREQUISITE_LABELS above
   stays: it is the label lookup for whichever keys that returns. */

interface GapTileSpec {
  label: string
  /** Canonical integer count remaining to the next tier. `null` skips
      the headline integer (no canonical field, no rankings row). */
  count: number | null
  /** Sub-item: the same gap expressed as a percentage. */
  gapPercent: number
  unitSingular: string
  unitPlural: string
  /** A link after the percentage, on the same row (#2390). */
  link?: { href: string; label: string }
}

/* The Methodology entry that explains the two Distinguished-club counts
   (#2390). A plain anchor: the trophy case renders outside a router in its
   unit tests, the same reason MembershipTrendChart links this way. */
const DISTINGUISHED_COUNTS_METHODOLOGY_HREF =
  '/methodology#distinguished-club-counts'

/* Item 1490, the District Recognition Program: the source of every tier
   threshold (docs/investigations/1116-historical-drp-rules.md;
   docs/toastmasters-rules-reference.md §13). */
const ITEM_1490_HREF =
  'https://content.toastmasters.org/image/upload/1490-district-recognition-program.pdf'

/* Row labels for the every-tier table (#2426): the column header already
   says "Tier", so the rows drop "Distinguished District". Same words as the
   Region scoreboard's cards (#2307). */
const TIER_ROW_LABELS: Record<DistrictRecognitionTier, string> = {
  Distinguished: 'Distinguished',
  Select: 'Select',
  Presidents: "President's",
  Smedley: 'Smedley',
}

const TIER_GAPS_ID = 'distinguished-tier-gaps'

const GapCell: React.FC<{ remaining: number | null }> = ({ remaining }) => (
  <td
    className={`py-1.5 pl-2 text-right tabular-nums ${
      remaining === 0
        ? 'text-tm-loyal-blue font-semibold'
        : 'text-gray-900 theme-dark:text-gray-100'
    }`}
  >
    {remaining === null
      ? '—'
      : remaining === 0
        ? '✓ met'
        : remaining.toLocaleString('en-US')}
  </td>
)

/* The gap at every tier (#2426): one row per tier of the year's ladder.
   `rows === null` renders the placeholder the loading skeleton reserves —
   the same table, so the reserved height comes from the same CSS. */
const TierGapTable: React.FC<{
  tiers: ReadonlyArray<DistrictRecognitionTier>
  rows: ReadonlyArray<TierGapRow> | null
}> = ({ tiers, rows }) => (
  <table className="w-full text-sm font-tm-body border-collapse">
    <caption className="sr-only">
      Still needed for each Distinguished District tier
    </caption>
    <thead>
      <tr className="text-[11px] uppercase tracking-wide text-gray-600 theme-dark:text-gray-400">
        <th scope="col" className="py-1 pr-2 text-left font-medium">
          Tier
        </th>
        <th scope="col" className="py-1 pl-2 text-right font-medium">
          Paid clubs
        </th>
        <th scope="col" className="py-1 pl-2 text-right font-medium">
          Payments
        </th>
        {/* "Distinguished" alone is wider than this column on a phone, so
            the phone header abbreviates; the name stays whole for AT. */}
        <th
          scope="col"
          aria-label="Distinguished clubs"
          className="py-1 pl-2 text-right font-medium"
        >
          <span aria-hidden="true" className="md:hidden">
            Dist. clubs
          </span>
          <span aria-hidden="true" className="hidden md:inline">
            Distinguished clubs
          </span>
        </th>
      </tr>
    </thead>
    <tbody>
      {tiers.map(tier => {
        const row = rows?.find(r => r.tier === tier) ?? null
        return (
          <tr
            key={tier}
            data-met={row ? String(row.met) : undefined}
            className="border-t border-gray-200 theme-dark:border-gray-700"
          >
            <th
              scope="row"
              className="py-1.5 pr-2 text-left font-medium text-gray-900 theme-dark:text-gray-100"
            >
              {TIER_ROW_LABELS[tier]}
              {row?.met && (
                <span className="ml-1.5 text-xs font-semibold text-tm-loyal-blue">
                  met
                </span>
              )}
            </th>
            <GapCell remaining={row ? row.paidClubsRemaining : null} />
            <GapCell remaining={row ? row.paymentsRemaining : null} />
            <GapCell remaining={row ? row.distinguishedClubsRemaining : null} />
          </tr>
        )
      })}
    </tbody>
  </table>
)

const GapTile: React.FC<GapTileSpec> = ({
  label,
  count,
  gapPercent,
  unitSingular,
  unitPlural,
  link,
}) => {
  // `count === 0` is the canonical "met" signal (lesson 103); only the
  // un-evaluable case (no canonical, no ranking) leaves the headline blank.
  const closed = count === 0
  const noun = count === 1 ? unitSingular : unitPlural
  return (
    <div
      data-testid="gap-tile"
      className="rounded-md border border-gray-200 theme-dark:border-gray-700 px-3 py-2"
    >
      <div
        data-testid="gap-tile-label"
        className="text-[11px] uppercase tracking-wide text-gray-600 theme-dark:text-gray-400 font-tm-body"
      >
        {label}
      </div>
      <div
        data-testid="gap-tile-value"
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          closed
            ? 'text-tm-loyal-blue'
            : 'text-gray-900 theme-dark:text-gray-100'
        }`}
      >
        {closed ? '✓' : count != null ? `${count} ${noun}` : '—'}
      </div>
      {!closed && count != null && (
        /* The link rides the percentage's row, so it adds no row to the
           375 Overview (#2390, PAGE_MAX_H). Only the short link fits there
           on the CI renderer's wider system-ui face at the 14px floor. */
        <div className="mt-0.5 text-[11px] text-gray-600 theme-dark:text-gray-400 font-tm-body">
          <span data-testid="gap-tile-subitem" className="tabular-nums">
            +{gapPercent.toFixed(1)}%
          </span>
          {link && (
            <span data-testid="gap-tile-link">
              <span aria-hidden="true"> · </span>
              <a
                href={link.href}
                className="text-tm-loyal-blue underline whitespace-nowrap"
              >
                {link.label}
              </a>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* Height-matched loading placeholder (#1105 / Lesson 107, 158). Reuses the
   real panel's chrome — the `redesign-panel` wrapper, the static title +
   "Program Item 1490" caption, the section borders, and the gap-tiles grid
   container — so the reserved height emerges from the SAME CSS that sizes the
   loaded panel (across breakpoints + dark mode) rather than a pinned `Npx`
   that drifts the day a label changes. Only the data rows (pill, summary,
   per-tile label/value) become skeleton bars. `aria-hidden` keeps it out of
   the AT tree and the gap-tile test queries. */
/** False inside a held placeholder (#2513): same geometry, no pulse. */
const PulseContext = React.createContext(true)

const SkeletonBar: React.FC<{ className: string }> = ({ className }) => {
  const pulse = React.useContext(PulseContext)
  return (
    <span
      className={`block ${pulse ? 'animate-pulse ' : ''}rounded bg-gray-200 theme-dark:bg-gray-700 ${className}`}
    />
  )
}

/**
 * The skeleton, also used still (`held`) while the awards read waits for the
 * card to near the viewport (#2513): identical geometry so nothing shifts
 * when it fills, but no pulse (nothing is loading yet) and its own test id.
 */
const TrophyCaseSkeleton: React.FC<{ programYear: string; held?: boolean }> = ({
  programYear,
  held = false,
}) => (
  <PulseContext.Provider value={!held}>
    <div
      className="redesign-panel"
      aria-hidden="true"
      data-testid={
        held ? 'distinguished-trophy-held' : 'distinguished-trophy-skeleton'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 font-tm-headline">
            Distinguished District Status
          </h2>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500 font-tm-body">
            Program Item 1490
          </p>
        </div>
        {/* Status pill placeholder — matches the px-4 py-2 text-base pill box. */}
        <SkeletonBar className="h-10 w-48 rounded-full" />
      </div>

      {/* Prerequisite summary line — 44px touch-target floor like the real
        toggle/status row, so the reserved height tracks it — and the
        checklist below it (#1647). The loaded list is expanded whenever a
        prerequisite is unmet, the common case for most of the year, and its
        rows are known before the data: one per required prerequisite of the
        program year. Each row carries its real label (invisible) so it wraps
        exactly like the loaded row at every column count. A district with
        every prerequisite met renders the list collapsed and settles upward —
        the same bounded, accepted residual as the gap tiles below. */}
      <div className="mb-4">
        <div className="flex items-center min-h-11">
          <SkeletonBar className="h-4 w-44" />
        </div>
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
          {requiredPrerequisitesForProgramYear(programYear).map(key => (
            <li
              key={key}
              data-testid="distinguished-trophy-skeleton-prereq"
              className="flex items-center gap-2 text-sm font-tm-body"
            >
              <span className="invisible font-bold">✗</span>
              <span className="invisible font-medium">
                {PREREQUISITE_LABELS[key]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Gap-to-next-tier: the dominant slot. Reuse the real section border +
        3-up grid so the tiles land in place. We always reserve this block
        because it's the common loaded shape (any district below its top tier
        shows a gap). Districts that resolve with `nextTierGap == null` (already
        Smedley, or Unknown) omit it and settle slightly UPWARD — a bounded,
        rare residual, far smaller than the original 0→full downward pop, and
        unknowable before the query lands. Same accepted-collapse tradeoff as
        AwardsRaceSection (#750). */}
      <div className="border-t border-gray-200 pt-4">
        <SkeletonBar className="h-4 w-40 mb-2" />
        {/* The "prerequisites must be met" line the loaded panel shows above
          the tiles while any prerequisite is unmet (#1647). */}
        <p
          data-testid="distinguished-trophy-skeleton-warning"
          className="invisible text-xs mb-2 font-tm-body"
        >
          ⚠ Prerequisites must be met before any tier can be earned
        </p>
        <div
          data-testid="distinguished-trophy-skeleton-tiles"
          className="grid grid-cols-1 md:grid-cols-3 gap-2"
        >
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="rounded-md border border-gray-200 theme-dark:border-gray-700 px-3 py-2"
            >
              {/* label · value · "+x%" sub-item — the three rows a populated
                GapTile renders in the common (count present, gate open)
                case, so the tile height matches the loaded one. */}
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="mt-1.5 h-5 w-16" />
              <SkeletonBar className="mt-1.5 h-3 w-10" />
            </div>
          ))}
        </div>
        {/* The loaded panel's md+ explainer line under the tiles (#2390). */}
        <p className="invisible hidden md:block mt-2 text-xs font-tm-body">
          Confirmed clubs only. The Distinguished Clubs card above shows the
          same confirmed count, with provisional clubs beside it.
        </p>
        {/* The every-tier table, shown from 768 up (#2426): the same table and
          source line, invisible, so the panel does not grow when it lands.
          Phones fold it behind a toggle and reserve nothing. */}
        <div
          data-testid="distinguished-trophy-skeleton-tiers"
          className="invisible hidden md:block mt-3 md:max-w-2xl"
        >
          <TierGapTable
            tiers={districtTiersForProgramYear(programYear)}
            rows={null}
          />
          <p className="mt-1 text-xs font-tm-body">
            Thresholds: District Recognition Program (Item 1490), {programYear}{' '}
            rules.
          </p>
        </div>
      </div>
    </div>
  </PulseContext.Provider>
)

export const DistinguishedDistrictTrophyCase: React.FC<
  DistinguishedDistrictTrophyCaseProps
> = ({
  status,
  isLoading = false,
  held = false,
  programYear,
  ranking,
  clubStrengthQualifies,
  clubStrengthGrowth,
  leadershipExcellenceQualifies,
  leadershipExcellenceYears,
  leadershipExcellenceOnTrack,
  educationTrainingQualifies,
  clubGrowthQualifies,
}) => {
  const [userExpanded, setUserExpanded] = useState(false)
  const [allTiersOpen, setAllTiersOpen] = useState(false)

  // Reserve the slot while the (separate, slower) competitive-awards query is
  // in flight so its late arrival doesn't shift the page below it (#1105 /
  // Lesson 107). Once it settles with genuinely no status, collapse to null.
  if (held) return <TrophyCaseSkeleton programYear={programYear} held />
  if (!status)
    return isLoading ? <TrophyCaseSkeleton programYear={programYear} /> : null

  const { currentTier, allPrerequisitesMet, prerequisites, nextTierGap } =
    status
  // Drive the visible checklist rows from the program year's required
  // gate set (#1354) rather than the fixed PREREQUISITE_LABELS map — so a
  // retired requirement (e.g. Region Advisor Visit for 2026-27, #1344)
  // stops rendering as a permanently-unmet row. Unconditional: `programYear`
  // is required, so there is no "which era?" question left to answer with a
  // default.
  const visibleKeys = requiredPrerequisitesForProgramYear(programYear)
  const metCount = visibleKeys.filter(k => prerequisites[k]).length
  const totalCount = visibleKeys.length
  // Unmet prereqs are the whole point of the panel — never let the user
  // collapse the list when something needs attention.
  const expanded = !allPrerequisitesMet || userExpanded
  const summaryText = `${metCount} of ${totalCount} prerequisites met`

  const additionalAwardsVisible =
    clubStrengthQualifies ||
    leadershipExcellenceQualifies ||
    educationTrainingQualifies ||
    clubGrowthQualifies

  /* Every tier's gap (#2426), under the year's own Item 1490 ladder. The
     Distinguished row prefers the canonical analytics fields (#686).
     Null without a rankings row. */
  const tierRows = deriveRemainingByTier(programYear, ranking, {
    paidClubsRemaining: status.paidClubsRemaining,
    paymentsRemaining: status.paymentsRemaining,
    distinguishedClubsRemaining: status.distinguishedClubsRemaining,
  })

  /* The three headline integers are the next tier's row, so the tiles and
     the table agree by construction. When the next tier is Distinguished
     the canonical fields (#686) stand alone, so the tiles still render
     without a rankings row. (#840 / lessons 103, 104) */
  const nextRow = nextTierGap
    ? tierRows?.find(r => r.tier === nextTierGap.tier)
    : undefined
  const canonicalNext = nextTierGap?.tier === 'Distinguished'
  const paidClubsCount =
    (canonicalNext ? status.paidClubsRemaining : undefined) ??
    nextRow?.paidClubsRemaining ??
    null
  const paymentsCount =
    (canonicalNext ? status.paymentsRemaining : undefined) ??
    nextRow?.paymentsRemaining ??
    null
  const distinguishedClubsCount =
    (canonicalNext ? status.distinguishedClubsRemaining : undefined) ??
    nextRow?.distinguishedClubsRemaining ??
    null

  return (
    <div className="redesign-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 font-tm-headline">
            Distinguished District Status
          </h2>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500 font-tm-body">
            Program Item 1490
          </p>
        </div>
        <span
          data-testid="distinguished-status-pill"
          className={`inline-flex items-center gap-2 px-4 py-2 text-base font-semibold rounded-full border-2 ${TIER_BADGE_STYLES[currentTier]}`}
          aria-label={`Current tier: ${TIER_LABELS[currentTier]}`}
        >
          <span aria-hidden="true">{TIER_ICONS[currentTier]}</span>
          {TIER_LABELS[currentTier]}
        </span>
      </div>

      <div className="mb-4">
        {allPrerequisitesMet ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="prerequisite-list"
            onClick={() => setUserExpanded(prev => !prev)}
            // min-h-11 = 44px touch target on mobile per WCAG 2.5.5.
            className="flex items-center gap-2 min-h-11 px-1 -mx-1 text-sm font-semibold font-tm-body text-tm-loyal-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-tm-loyal-blue rounded"
          >
            <span aria-hidden="true">✓</span>
            {summaryText}
            <span aria-hidden="true" className="text-xs">
              {expanded ? '▴' : '▾'}
            </span>
          </button>
        ) : (
          <div
            role="status"
            className="flex items-center gap-2 text-sm font-semibold font-tm-body text-tm-true-maroon"
          >
            <span aria-hidden="true">⚠</span>
            {summaryText}
          </div>
        )}
        {expanded && (
          <ul
            id="prerequisite-list"
            className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1"
          >
            {visibleKeys.map(key => {
              const met = prerequisites[key]
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 text-sm font-tm-body"
                >
                  <span
                    className={
                      met
                        ? 'text-tm-loyal-blue font-bold'
                        : 'text-tm-true-maroon font-bold'
                    }
                    aria-hidden="true"
                  >
                    {met ? '✓' : '✗'}
                  </span>
                  <span
                    className={
                      met ? 'text-gray-900' : 'text-gray-700 font-medium'
                    }
                  >
                    {PREREQUISITE_LABELS[key]}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {nextTierGap && (
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            {/* Phones show the short tier name so the heading and the toggle
                share one line: the full name wrapped beside the toggle on
                CI's Linux fonts and cost the 375 Overview a row it does not
                have (4007 > 4000, PAGE_MAX_H). The panel title already says
                "Distinguished District"; the heading's name stays whole. */}
            <h3
              aria-label={`Gap to ${TIER_LABELS[nextTierGap.tier]}`}
              className="text-sm font-semibold text-gray-700 font-tm-body"
            >
              <span aria-hidden="true" className="md:hidden">
                Gap to{' '}
                {nextTierGap.tier in TIER_ROW_LABELS
                  ? TIER_ROW_LABELS[nextTierGap.tier as DistrictRecognitionTier]
                  : TIER_LABELS[nextTierGap.tier]}
              </span>
              <span aria-hidden="true" className="hidden md:inline">
                Gap to {TIER_LABELS[nextTierGap.tier]}
              </span>
            </h3>
            {tierRows && (
              /* Phones only (#2426): the 375 Overview has no row to spare
                 (PAGE_MAX_H), so the table folds behind this toggle, which
                 shares the heading's row. -my-3 py-3 gives a 44px touch
                 target without adding height. */
              <button
                type="button"
                aria-expanded={allTiersOpen}
                aria-controls={TIER_GAPS_ID}
                onClick={() => setAllTiersOpen(prev => !prev)}
                className="md:hidden -my-3 py-3 px-1 text-sm font-semibold font-tm-body text-tm-loyal-blue whitespace-nowrap hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-tm-loyal-blue rounded"
              >
                Every tier{' '}
                <span aria-hidden="true" className="text-xs">
                  {allTiersOpen ? '▴' : '▾'}
                </span>
              </button>
            )}
          </div>
          {!allPrerequisitesMet && (
            <p className="text-xs text-tm-true-maroon mb-2 font-tm-body">
              ⚠ Prerequisites must be met before any tier can be earned
            </p>
          )}
          <div
            data-testid="distinguished-gap-tiles"
            className="grid grid-cols-1 md:grid-cols-3 gap-2"
          >
            {/* Headline integer is the canonical countdown to the next tier,
                matching the region row's "Remaining to Distinguished" cells.
                Percentage demoted to a sub-item. Labels mirror the region
                page exactly. (#840 / lesson 103) */}
            <GapTile
              label="Paid Clubs"
              count={paidClubsCount}
              gapPercent={nextTierGap.clubGrowthGap}
              unitSingular="club"
              unitPlural="clubs"
            />
            <GapTile
              label="Payments"
              count={paymentsCount}
              gapPercent={nextTierGap.paymentGrowthGap}
              unitSingular="payment"
              unitPlural="payments"
            />
            {/* Confirmed clubs (#304/#2221), the share card's noun (#2304).
                The KPI card above shows the same confirmed count (#2554), with
                provisional beside it. */}
            <GapTile
              label="Distinguished Clubs"
              count={distinguishedClubsCount}
              gapPercent={nextTierGap.distinguishedPercentGap}
              unitSingular="confirmed club"
              unitPlural="confirmed clubs"
              link={{
                href: DISTINGUISHED_COUNTS_METHODOLOGY_HREF,
                label: 'How we count',
              }}
            />
          </div>
          {/* One line from 768 up (#2390). Phones carry the "confirmed
              clubs" noun and the link only: this line would cost the 375
              page a row it does not have. */}
          <p
            data-testid="distinguished-gap-explainer"
            className="hidden md:block mt-2 text-xs text-gray-600 theme-dark:text-gray-400 font-tm-body"
          >
            Confirmed clubs only. The Distinguished Clubs card above shows the
            same confirmed count, with provisional clubs beside it.
          </p>
          {tierRows && (
            <div
              id={TIER_GAPS_ID}
              data-testid="distinguished-tier-gaps"
              className={`${allTiersOpen ? '' : 'hidden'} md:block mt-3 md:max-w-2xl`}
            >
              <TierGapTable tiers={tierRows.map(r => r.tier)} rows={tierRows} />
              <p className="mt-1 text-xs text-gray-600 theme-dark:text-gray-400 font-tm-body">
                Thresholds: District Recognition Program (
                <a
                  href={ITEM_1490_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-tm-loyal-blue underline"
                >
                  Item 1490
                </a>
                ), {programYear} rules.
              </p>
            </div>
          )}
        </div>
      )}

      {additionalAwardsVisible && (
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 font-tm-body">
            Additional Awards Earned
          </h3>
          <div className="flex flex-wrap gap-2">
            {clubStrengthQualifies && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border bg-green-50 text-green-800 border-green-200"
                title={`Club Strength Award — ${clubStrengthGrowth?.toFixed(1)}% avg club size growth`}
              >
                <span aria-hidden="true">💪</span>
                Club Strength
                {clubStrengthGrowth != null &&
                  ` (+${clubStrengthGrowth.toFixed(1)}%)`}
              </span>
            )}
            {leadershipExcellenceQualifies && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border bg-purple-50 text-purple-800 border-purple-200"
                title={`Leadership Excellence — ${leadershipExcellenceYears} consecutive Distinguished years`}
              >
                <span aria-hidden="true">⭐</span>
                Leadership Excellence ({leadershipExcellenceYears}yr)
              </span>
            )}
            {educationTrainingQualifies && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border bg-blue-50 text-blue-800 border-blue-200"
                title="Excellence in Education & Training (PQD)"
              >
                <span aria-hidden="true">🎓</span>
                Education & Training (PQD)
              </span>
            )}
            {clubGrowthQualifies && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border bg-teal-50 text-teal-800 border-teal-200"
                title="Excellence in Club Growth (CGD)"
              >
                <span aria-hidden="true">📈</span>
                Club Growth (CGD)
              </span>
            )}
          </div>
          {/* #1613 — shown for every program year (product decision), but
              TI no longer lists it, so say so rather than imply it is
              still presented. */}
          {clubStrengthQualifies && (
            <p className="mt-2 text-xs text-gray-600 font-tm-body">
              Club Strength: TI removed this award from Item 1490 in Rev.
              03/2026, so it may not be presented.
            </p>
          )}
        </div>
      )}

      {leadershipExcellenceOnTrack && !leadershipExcellenceQualifies && (
        <p className="border-t border-gray-200 pt-4 text-sm text-gray-700 font-tm-body">
          <span aria-hidden="true">⭐</span> On track for Leadership Excellence:{' '}
          {leadershipExcellenceYears} consecutive Distinguished years so far,
          and tracking Distinguished this year. Awarded at the year-end close.
        </p>
      )}
    </div>
  )
}
