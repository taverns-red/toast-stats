import React, { useCallback, useEffect, useState } from 'react'
import { KpiBulletCard } from './KpiBulletCard'
import { PROVISIONAL_NOTE } from './DistinguishedCount'
import { KpiDeltaCard } from './KpiDeltaCard'
import type { MetricRankings, RecognitionTargets } from '../types/districts'
import {
  TIERED_KPI_GOALS,
  type SuccessPlanGoals,
  type TieredKpiKey,
} from '../utils/successPlanTargets'
import { formatCompact, formatSignedCompact } from '../utils/formatCompact'

/* #572 — sticky KPI strip extracted from DistrictOverview.

   Presentational: takes already-loaded KPI values + targets and
   renders three tier-progress KpiBulletCards plus a signed-delta
   KpiDeltaCard (Net Member Change, #681) inside a sticky region,
   with a legend expanding the bullet-bar D/S/P/Sm tier markers.
   Mobile gets a chevron that collapses the strip into a single
   compact summary row; the collapsed state persists in
   sessionStorage for the rest of the tab session. */

export interface DistrictKpiCardData {
  current: number
  targets: RecognitionTargets | null
  rankings: MetricRankings
  /** Distinguished only (#2554): clubs that qualify on current membership but
   *  are not yet confirmed. `current` is then the confirmed count. */
  provisional?: number
  /** Distinguished only (#2580): `qualifying-today` when `current` is not a
   *  confirmed count (no confirmed source was available). */
  basis?: 'confirmed' | 'qualifying-today'
}

/** Net Member Change is a signed delta with no Distinguished tiers, so it
 *  carries only a current value — not targets/rankings (#681). */
export interface DistrictKpiDeltaData {
  current: number
}

export interface DistrictKpiStripData {
  paidClubs: DistrictKpiCardData
  membershipPayments: DistrictKpiCardData
  distinguishedClubs: DistrictKpiCardData
  netMemberChange: DistrictKpiDeltaData
}

export interface DistrictKpiStripProps {
  kpis: DistrictKpiStripData | null
  /** Success Plan goals for the year on screen, from `?targets=` (#2297).
   *  The page resolves them (R3); each tiered card gets its own Plan tick. */
  planGoals?: SuccessPlanGoals | null
}

const STORAGE_KEY = 'district-kpi-strip-collapsed'

const readInitialCollapsed = (): boolean => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// Legend expanding the bullet-bar tier abbreviations (#681). Without this the
// D/S/P/Sm ticks are cryptic — the meaning was only reachable on hover.
const CARD_TOOLTIPS: Record<TieredKpiKey, string> = {
  paidClubs:
    'Paid clubs count with thresholds for each Distinguished District recognition level. The world rank and percentile are ranked by club growth %, not by this count.',
  membershipPayments:
    'Total membership payments (New + April + October + Late + Charter) with thresholds for each recognition level. The world rank and percentile are ranked by membership payments growth %, not by this total.',
  // Qualifying today, not confirmed: the trophy case's gap counts confirmed
  // clubs, so the two numbers differ by design (#2390).
  distinguishedClubs:
    'Confirmed Distinguished clubs, with the thresholds for each Distinguished District recognition level. The Distinguished District gap uses this confirmed count; the world rank and percentile are ranked by distinguished % of the club base. +N qualifying today: clubs that qualify on current membership whose April renewals do not yet confirm the level; they are shown beside the count, never added to it.',
}

// The measure each card's world rank is actually based on. It is not the
// figure the card prints (analytics-core MetricRankingsCalculator ranks by the
// growth or share fields), so the card names it (#2613).
const RANKED_BY: Record<TieredKpiKey, string> = {
  paidClubs: 'club growth %',
  membershipPayments: 'membership payments growth %',
  distinguishedClubs: 'distinguished % of the club base',
}

const TIER_LEGEND: { short: string; full: string }[] = [
  { short: 'D', full: 'Distinguished' },
  { short: 'S', full: 'Select' },
  { short: 'P', full: "President's" },
  { short: 'Sm', full: 'Smedley' },
]

export const DistrictKpiStrip: React.FC<DistrictKpiStripProps> = ({
  kpis,
  planGoals = null,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      /* sessionStorage may throw in private modes; degrade silently. */
    }
  }, [collapsed])

  const toggle = useCallback(() => setCollapsed(prev => !prev), [])

  if (!kpis) return <DistrictKpiStripSkeleton collapsed={collapsed} />

  return (
    <section
      aria-labelledby="district-kpi-strip-heading"
      className={`district-kpi-strip${
        collapsed ? ' district-kpi-strip--collapsed' : ''
      }`}
    >
      <h2 id="district-kpi-strip-heading" className="sr-only">
        Key district metrics
      </h2>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="district-kpi-strip-body"
        aria-label={collapsed ? 'Expand KPI strip' : 'Collapse KPI strip'}
        className="district-kpi-strip__toggle"
      >
        <span aria-hidden="true">{collapsed ? '▾' : '▴'}</span>
      </button>

      {collapsed ? (
        <KpiSummary kpis={kpis} />
      ) : (
        <KpiExpanded kpis={kpis} planGoals={planGoals} />
      )}
    </section>
  )
}

/* The loaded strip's two bodies, shared with the loading skeleton below so
   the reserved slot is laid out by the same markup and CSS (#1647). */
interface KpiBodyProps {
  kpis: DistrictKpiStripData
  /** Render as the loading skeleton's invisible, inert layout ghost. */
  ghost?: boolean
  planGoals?: SuccessPlanGoals | null
}

/* The skeleton must not reuse the live body's id/test id: a ghost is not the
   element the toggle controls, and tests look the summary up by test id. */
const ghostProps = (ghost: boolean | undefined, liveTestId?: string) =>
  ghost
    ? ({ 'aria-hidden': true, inert: true } as const)
    : {
        id: 'district-kpi-strip-body',
        ...(liveTestId !== undefined && { 'data-testid': liveTestId }),
      }

const KpiSummary: React.FC<KpiBodyProps> = ({ kpis, ghost }) => (
  <div
    {...ghostProps(ghost, 'district-kpi-strip-summary')}
    className={`district-kpi-strip__summary${ghost ? ' district-kpi-strip__ghost' : ''}`}
  >
    <span>
      <strong>Paid</strong> {formatCompact(kpis.paidClubs.current)}
    </span>
    <span aria-hidden="true" className="district-kpi-strip__sep">
      ·
    </span>
    <span>{formatCompact(kpis.membershipPayments.current)} pmts</span>
    <span aria-hidden="true" className="district-kpi-strip__sep">
      ·
    </span>
    <span>
      {formatCompact(kpis.distinguishedClubs.current)} dist.
      {kpis.distinguishedClubs.basis === 'qualifying-today' &&
        ' qualifying today'}
      {(kpis.distinguishedClubs.basis ?? 'confirmed') === 'confirmed' &&
        (kpis.distinguishedClubs.provisional ?? 0) > 0 && (
          <>
            {` +${formatCompact(kpis.distinguishedClubs.provisional ?? 0)} qualifying today`}
            <span
              data-testid="distinguished-provisional-note"
              className="sr-only"
            >
              {' '}
              {PROVISIONAL_NOTE}
            </span>
          </>
        )}
    </span>
    <span aria-hidden="true" className="district-kpi-strip__sep">
      ·
    </span>
    <span>{formatSignedCompact(kpis.netMemberChange.current)} net</span>
  </div>
)

const KpiExpanded: React.FC<KpiBodyProps> = ({ kpis, ghost, planGoals }) => (
  <div
    {...ghostProps(ghost)}
    className={`district-kpi-strip__expanded${ghost ? ' district-kpi-strip__ghost' : ''}`}
  >
    <div className="district-kpi-strip__cards">
      {/* Card order comes from the shared list the targets panel uses. */}
      {TIERED_KPI_GOALS.map(g => (
        <KpiBulletCard
          key={g.kpi}
          title={g.cardTitle}
          current={kpis[g.kpi].current}
          targets={kpis[g.kpi].targets}
          rankings={kpis[g.kpi].rankings}
          planTarget={planGoals?.[g.goal]}
          provisional={kpis[g.kpi].provisional}
          basis={kpis[g.kpi].basis}
          tooltipContent={CARD_TOOLTIPS[g.kpi]}
          rankedBy={RANKED_BY[g.kpi]}
        />
      ))}
      <KpiDeltaCard
        title="Net Member Change"
        current={kpis.netMemberChange.current}
        secondaryLabel="payments vs. program-year base"
        tooltipContent="Membership payments minus the program-year payment base (the recognition baseline). This differs from the Trends 'Net Change', which compares member counts against the first snapshot of the year."
      />
    </div>
    <p
      className="district-kpi-strip__legend"
      data-testid="district-kpi-strip-legend"
    >
      <span className="district-kpi-strip__legend-label">Tier markers:</span>
      {TIER_LEGEND.map((t, i) => (
        <span key={t.short} className="district-kpi-strip__legend-item">
          {i > 0 && (
            <span aria-hidden="true" className="district-kpi-strip__sep">
              ·
            </span>
          )}
          <strong>{t.short}</strong> {t.full}
        </span>
      ))}
      {planGoals && Object.keys(planGoals).length > 0 && (
        <span className="district-kpi-strip__legend-item">
          <span aria-hidden="true" className="district-kpi-strip__sep">
            ·
          </span>
          <strong>Plan</strong> Success Plan target
        </span>
      )}
    </p>
  </div>
)

/* Representative values for the loading ghost (#1647). Only their SHAPE
   matters: every card renders its full loaded row set (title, value, rank
   line with a region chip, bullet bar, four-tier legend), so the reserved
   slot is as tall as a loaded strip at every width. Never shown — the ghost
   is `visibility: hidden` under a shimmer. */
const GHOST_RANKINGS: MetricRankings = {
  worldRank: 88,
  worldPercentile: 50,
  regionRank: 8,
  totalDistricts: 128,
  totalInRegion: 14,
  region: '08',
}
const GHOST_TARGETS: RecognitionTargets = {
  distinguished: 1000,
  select: 1050,
  presidents: 1100,
  smedley: 1150,
}
const GHOST_KPIS: DistrictKpiStripData = {
  paidClubs: { current: 888, targets: GHOST_TARGETS, rankings: GHOST_RANKINGS },
  membershipPayments: {
    current: 8888,
    targets: GHOST_TARGETS,
    rankings: GHOST_RANKINGS,
  },
  distinguishedClubs: {
    current: 888,
    targets: GHOST_TARGETS,
    rankings: GHOST_RANKINGS,
  },
  netMemberChange: { current: 888 },
}

/* Structural loading skeleton (#1647, Lessons 107/158). The old skeleton was
   a single 64px bar; the loaded strip is 312px on desktop and ~750px on a
   phone (2×2 cards + legend), so the swap was the largest shift on
   /district/:id. The skeleton now renders the loaded strip's OWN body —
   same section chrome, the toggle's 44px column, the same cards and legend,
   or the summary row when the visitor collapsed the strip — inside an
   `inert`, `aria-hidden`, invisible ghost under a shimmer. Its height falls
   out of the same CSS that sizes the loaded strip; nothing is pinned. */
const DistrictKpiStripSkeleton: React.FC<{ collapsed: boolean }> = ({
  collapsed,
}) => (
  <section
    aria-label="District KPI strip"
    aria-busy="true"
    className="district-kpi-strip district-kpi-strip--loading"
    data-testid="district-kpi-strip-skeleton"
  >
    <span aria-hidden="true" className="district-kpi-strip__toggle" />
    {collapsed ? (
      <KpiSummary kpis={GHOST_KPIS} ghost />
    ) : (
      <KpiExpanded kpis={GHOST_KPIS} ghost />
    )}
    <div className="district-kpi-strip__skeleton" aria-hidden="true" />
  </section>
)
