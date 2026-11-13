/**
 * CriterionCell (#2718, M5 of #2676).
 *
 * A requirement's outcome as a shape marker plus the words "Met" or "Not met",
 * so it never rests on colour alone (WCAG 1.4.1) and never on a Unicode glyph
 * (a tick or cross can render as a colour emoji). The shapes are the shared
 * status markers: a plain tick for met, a filled circle with a knocked-out
 * cross for not met. Colours come from `.dt-marker--*` (legacy tokens only).
 */

import React from 'react'
import { StatusMarker } from './StatusMarker'

interface CriterionCellProps {
  met: boolean
  /** The figure the outcome qualifies, e.g. "5/8". Shown first. */
  children?: React.ReactNode
}

export const CriterionCell: React.FC<CriterionCellProps> = ({
  met,
  children,
}) => (
  <span className={`dt-criterion dt-criterion--${met ? 'met' : 'not-met'}`}>
    {children !== undefined && (
      <>
        <span className="dt-criterion__figure">{children}</span>{' '}
      </>
    )}
    <span className="dt-criterion__outcome">
      <StatusMarker status={met ? 'thriving' : 'intervention-required'} />
      <span>{met ? 'Met' : 'Not met'}</span>
    </span>
  </span>
)

export default CriterionCell
