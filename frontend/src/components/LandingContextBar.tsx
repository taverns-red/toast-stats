import React from 'react'
import type { ProgramYear } from '../utils/programYear'
import type { SnapshotDate } from '../types/snapshotDate'

export interface LandingContextBarProps {
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: (py: ProgramYear) => void
  availableProgramYears: ProgramYear[]
  cachedDates: SnapshotDate[]
  selectedDate: SnapshotDate | undefined
  setSelectedDate: (date: SnapshotDate | undefined) => void
  effectiveDate: SnapshotDate | undefined
  asOfDate: string | undefined
  isLatestSnapshot: boolean
  orientation: React.ReactNode
  onExportCsv?: (() => void) | undefined
}

// Red stub (#1846) — implemented in the next commit.
export const LandingContextBar: React.FC<LandingContextBarProps> = () => null

export default LandingContextBar
