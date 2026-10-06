import React, { useCallback, useEffect, useState } from 'react'
import { KpiBulletCard } from './KpiBulletCard'
import { KpiDeltaCard } from './KpiDeltaCard'
import type { MetricRankings, RecognitionTargets } from '../types/districts'

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
}

const STORAGE_KEY = 'district-kpi-strip-collapsed'

const readInitialCollapsed = (): boolean => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const formatCompact = (n: number): string => {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return `${k.toFixed(k >= 10 ? 0 : 1)}K`
  }
  return String(n)
}

// Signed compact form for the collapsed summary: +312 / −1.2K / 0.
const formatSignedCompact = (n: number): string => {
  if (n === 0) return '0'
  const sign = n > 0 ? '+' : '−'
  return `${sign}${formatCompact(Math.abs(n))}`
}

// Legend expanding the bullet-bar tier abbreviations (#681). Without this the
// D/S/P/Sm ticks are cryptic — the meaning was only reachable on hover.
const TIER_LEGEND: { short: string; full: string }[] = [
  { short: 'D', full: 'Distinguished' },
  { short: 'S', full: 'Select' },
  { short: 'P', full: "President's" },
  { short: 'Sm', full: 'Smedley' },
]

export const DistrictKpiStrip: React.FC<DistrictKpiStripProps> = ({ kpis }) => {
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

      {collapsed ? <KpiSummary kpis={kpis} /> : <KpiExpanded kpis={kpis} />}
    </section>
  )
}

/* The loaded strip's two bodies, shared with the loading skeleton below so
   the reserved slot is laid out by the same markup and CSS (#1647). */
interface KpiBodyProps {
  kpis: DistrictKpiStripData
  /** Render as the loading skeleton's invisible, inert layout ghost. */
  ghost?: boolean
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
    <span>{formatCompact(kpis.distinguishedClubs.current)} dist.</span>
    <span aria-hidden="true" className="district-kpi-strip__sep">
      ·
    </span>
    <span>{formatSignedCompact(kpis.netMemberChange.current)} net</span>
  </div>
)

const KpiExpanded: React.FC<KpiBodyProps> = ({ kpis, ghost }) => (
  <div
    {...ghostProps(ghost)}
    className={`district-kpi-strip__expanded${ghost ? ' district-kpi-strip__ghost' : ''}`}
  >
    <div className="district-kpi-strip__cards">
      <KpiBulletCard
        title="Paid Clubs"
        current={kpis.paidClubs.current}
        targets={kpis.paidClubs.targets}
        rankings={kpis.paidClubs.rankings}
        tooltipContent="Paid clubs count with thresholds for each Distinguished District recognition level."
      />
      <KpiBulletCard
        title="Membership Payments"
        current={kpis.membershipPayments.current}
        targets={kpis.membershipPayments.targets}
        rankings={kpis.membershipPayments.rankings}
        tooltipContent="Total membership payments (New + April + October + Late + Charter) with thresholds for each recognition level."
      />
      <KpiBulletCard
        title="Distinguished Clubs"
        current={kpis.distinguishedClubs.current}
        targets={kpis.distinguishedClubs.targets}
        rankings={kpis.distinguishedClubs.rankings}
        tooltipContent="Clubs achieving DCP goals + membership requirements with thresholds for each recognition level."
      />
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
