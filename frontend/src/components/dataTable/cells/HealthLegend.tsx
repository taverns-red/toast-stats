/**
 * HealthLegend (#2676, Clubs table spec §3.2).
 *
 * One always-visible line above the table (and above the phone list) that
 * explains the three health markers and what "provisional" means, so neither
 * rests on a tooltip (HUB-20, HUB-30).
 */

import React from 'react'
import { StatusMarker } from './StatusMarker'

export const HealthLegend: React.FC = () => (
  <p className="dt-legend" data-testid="health-legend">
    <span className="dt-legend__item">
      <StatusMarker status="intervention-required" /> Intervention
    </span>
    {/* Flex items: spacing comes from the column-gap in data-table.css, since
        whitespace between or inside flex items collapses away. */}
    <span className="dt-legend__sep" aria-hidden="true">
      {'·'}
    </span>
    <span className="dt-legend__item">
      <StatusMarker status="vulnerable" /> Vulnerable
    </span>
    <span className="dt-legend__sep" aria-hidden="true">
      {'·'}
    </span>
    <span className="dt-legend__item">
      <StatusMarker status="thriving" /> Thriving.
    </span>
    <span className="dt-legend__note">
      <em>Provisional:</em> qualifies today; confirmed once April renewals are
      recorded.
    </span>
  </p>
)

export default HealthLegend
