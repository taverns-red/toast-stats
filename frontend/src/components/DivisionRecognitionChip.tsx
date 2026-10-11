/* DivisionRecognitionChip (#1833, #1862) — a division's recognition status as
 * glyph + text + tone, so it never rests on colour (WCAG 1.4.1). Net loss
 * outranks the tier, matching the desktop DivisionSummary badge. Shared by the
 * phone division rows and the phone progress-summary disclosures so the same
 * datum reads identically on one page (lesson 052). Styled by `.mobile-chip`
 * (mobile-row-list.css). */

import React from 'react'
import type { DivisionPerformance } from '../utils/divisionStatus'
import { calculateDivisionGapAnalysis } from '../utils/divisionGapAnalysis'

export interface DivisionChipInfo {
  glyph: string
  label: string
  tone: 'good' | 'bad' | 'neutral'
}

export function divisionChip(division: DivisionPerformance): DivisionChipInfo {
  const gap = calculateDivisionGapAnalysis({
    clubBase: division.clubBase,
    paidClubs: division.paidClubs,
    distinguishedClubs: division.distinguishedClubs,
  })
  if (!gap.meetsNoNetLossRequirement)
    return { glyph: '✗', label: 'Net loss', tone: 'bad' }
  switch (division.status) {
    case 'presidents-distinguished':
      return { glyph: '★', label: "President's", tone: 'good' }
    case 'select-distinguished':
      return { glyph: '★', label: 'Select', tone: 'good' }
    case 'distinguished':
      return { glyph: '★', label: 'Distinguished', tone: 'good' }
    default:
      return { glyph: '○', label: 'Not distinguished', tone: 'neutral' }
  }
}

export const DivisionRecognitionChip: React.FC<{
  division: DivisionPerformance
}> = ({ division }) => {
  const chip = divisionChip(division)
  return (
    <span className={`mobile-chip mobile-chip--${chip.tone}`}>
      <span aria-hidden="true">{chip.glyph}</span> {chip.label}
    </span>
  )
}

export default DivisionRecognitionChip
