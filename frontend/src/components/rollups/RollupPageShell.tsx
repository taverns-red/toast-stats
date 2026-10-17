import './rollups.css'
import React from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { ProgramYearControls } from '../../hooks/useProgramYearControls'
import { DataControlsBar } from '../DataControlsBar'
import { ContextBar, type ContextCrumb } from '../ContextBar'
import { ContextSheetControls } from '../ContextSheetControls'
import { MobileRowList, type MobileRow } from '../MobileRowList'
import { formatFreshnessLine } from '../../utils/contextBar'
import { RegionSubnav } from './RegionSubnav'
import { formatShare, type AttentionRow } from '../../utils/regionRollupView'

/* RollupPageShell (#1815) — the chrome shared by `/regions/health` and
   `/region/:n/health`: phone context bar, desktop header with the PY/date
   controls (the page's own state, R3), the Rankings / Health & compliance
   subnav. The page supplies the body. */

export interface RollupPageShellProps {
  title: string
  eyebrow: string
  lede: string
  back?: { label: string; to: string }
  trail: ContextCrumb[]
  subnavBase: string
  controls: ProgramYearControls
  children: React.ReactNode
}

export const RollupPageShell: React.FC<RollupPageShellProps> = ({
  title,
  eyebrow,
  lede,
  back,
  trail,
  subnavBase,
  controls: c,
  children,
}) => {
  return (
    <div className="districts-page rollup-page">
      <ContextBar
        title={title}
        back={back}
        programYear={c.selectedProgramYear}
        date={c.effectiveDate}
        controls={
          <ContextSheetControls
            availableProgramYears={c.availableProgramYears}
            selectedProgramYear={c.selectedProgramYear}
            onProgramYearChange={c.setSelectedProgramYear}
            availableDates={c.cachedDates}
            selectedDate={c.selectedDate}
            onDateChange={c.setSelectedDate}
            freshness={formatFreshnessLine({
              asOfDate: undefined,
              snapshotDate: c.effectiveDate,
              isLatest: c.isLatestSnapshot,
            })}
          />
        }
        about={lede}
        trail={trail}
      />
      <header className="districts-page-header">
        <div className="districts-page-header__intro">
          <p className="districts-page-header__eyebrow">{eyebrow}</p>
          <h1 className="districts-page-header__title">{title}</h1>
          <p className="districts-page-header__lede">{lede}</p>
        </div>
        <div className="districts-page-header__actions">
          <DataControlsBar
            latestSnapshotDate={c.effectiveDate}
            isLatest={c.isLatestSnapshot}
            availableProgramYears={c.availableProgramYears}
            selectedProgramYear={c.selectedProgramYear}
            onProgramYearChange={c.setSelectedProgramYear}
            availableDates={c.cachedDates}
            selectedDate={c.selectedDate}
            onDateChange={c.setSelectedDate}
            freshnessPending={c.isDatesPending}
          />
        </div>
      </header>
      <RegionSubnav base={subnavBase} label={`${title} sections`} />
      {children}
    </div>
  )
}

/** "Needs attention" (#1815, hub hierarchy §5.5): the children with the
 *  highest intervention-required share, as phone rows linking down a level.
 *  Phones only — at 768 and up the sortable breakdown table carries it. */
export const RollupNeedsAttention: React.FC<{
  rows: readonly AttentionRow[]
}> = ({ rows }) => {
  const isMobile = useIsMobile(768)
  if (!isMobile || rows.length === 0) return null
  const items: MobileRow[] = rows.map(a => ({
    id: a.id,
    to: a.to,
    title: a.label,
    chip: <span className="district-hub__count">{formatShare(a.share)}</span>,
    meta: `${a.count.toLocaleString('en-US')} clubs need intervention`,
  }))
  return (
    <section
      className="district-hub__block rollup-attention"
      aria-labelledby="rollup-attention-heading"
      data-testid="rollup-attention"
    >
      <h2 id="rollup-attention-heading" className="district-hub__block-title">
        Needs attention
      </h2>
      <MobileRowList label="Needs attention" rows={items} />
    </section>
  )
}

/** Reserved slot while the rollups load: the KPI tiles with dashes and the
 *  sections' footprint, so the loaded page does not shift (Lesson 107). */
export const RollupSkeleton: React.FC = () => (
  <div className="rollup" aria-busy="true" data-testid="rollup-skeleton">
    <ul className="rollup-kpis" aria-hidden="true">
      {['Clubs', 'Members', 'Payments', 'Distinguished'].map(l => (
        <li key={l} className="rollup-kpi">
          <span className="rollup-kpi__label">{l}</span>
          <span className="rollup-kpi__value">—</span>
        </li>
      ))}
    </ul>
    <div className="rollup-sections rollup-sections--skeleton" />
  </div>
)

export default RollupPageShell
