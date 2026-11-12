import React from 'react'
import { ContextBar } from './ContextBar'
import { RegionSubnav } from './rollups/RegionSubnav'

/* Structural loading shells for the region pages (#2634, Lesson 158).

   While a region page waits for its rankings, region history, awards and
   pace, it used to show one generic card. The loaded page is a header, a
   subnav, a KPI strip, a recognition block and a table, so every arrival
   pushed what was already on screen (0.33 CLS on /region/04 at 768).

   A shell draws the real frame: the real title, subnav and controls slot,
   and placeholders whose boxes come from the same classes as the loaded
   blocks (the KPI cards are the real card classes with their text hidden) or
   from a reserved height measured on the loaded page (recognition, table).
   The skeleton fill is `--surface-2`, the one fill every shell uses. */

/** A KPI card with the loaded card's box and nothing readable in it. */
const GhostKpiCard: React.FC<{ label: string }> = ({ label }) => (
  <div className="districts-kpi-card shell-ghost" aria-hidden="true">
    <p className="districts-kpi-card__label">{label}</p>
    <div className="districts-kpi-card__value">0</div>
    <p className="text-xs mt-1">Base 0 · +0 · +0.0%</p>
  </div>
)

export const RegionPageLoadingShell: React.FC<{ region: string }> = ({
  region,
}) => (
  <div
    className="districts-page"
    role="status"
    aria-label="Loading region"
    data-testid="region-loading-shell"
  >
    <ContextBar
      title={`Region ${region}`}
      back={{ label: 'Regions', to: '/regions' }}
      chipLabel="About"
    />
    <header className="districts-page-header">
      <div className="districts-page-header__intro">
        <p className="districts-page-header__eyebrow">
          Toastmasters Region {region}
        </p>
        <h1 className="districts-page-header__title">Region {region}</h1>
        <p className="districts-page-header__lede shell-ghost-text">
          0 districts in this region. Click a district to drill into its clubs.
        </p>
      </div>
      <div className="districts-page-header__actions">
        <div className="shell-block shell-block--controls" />
      </div>
    </header>
    <RegionSubnav
      base={`/region/${region}`}
      label={`Region ${region} sections`}
    />
    <div className="districts-kpi-strip" style={{ marginBottom: 24 }}>
      <GhostKpiCard label="Districts" />
      <GhostKpiCard label="Paid Clubs" />
      <GhostKpiCard label="Payments" />
      <GhostKpiCard label="Distinguished Clubs" />
    </div>
    <div className="shell-block shell-block--recognition" />
    <div className="shell-block shell-block--table" />
  </div>
)

export const RegionsPageLoadingShell: React.FC = () => (
  <div
    className="app-shell__page"
    role="status"
    aria-label="Loading regions"
    data-testid="regions-loading-shell"
  >
    <header className="districts-page-header">
      <div className="districts-page-header__intro">
        <p className="districts-page-header__eyebrow">
          All regions · 14 worldwide
        </p>
        <h1 className="districts-page-header__title">Regions</h1>
        <p className="districts-page-header__lede">
          Aggregate ranking of all 14 Toastmasters regions. Click any region to
          drill into its districts.
        </p>
      </div>
      <div className="districts-page-header__actions">
        <div className="shell-block shell-block--controls" />
      </div>
    </header>
    <RegionSubnav base="/regions" label="Regions sections" />
    <div className="shell-block shell-block--finder" />
    <div className="shell-block shell-block--regions-table" />
  </div>
)
