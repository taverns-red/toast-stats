import type React from 'react'
import type { ProgramYear } from '../utils/programYear'
import type { SnapshotDate } from '../types/snapshotDate'

/* #1831 red stub — implemented in the next commit. */
export interface ContextSheetControlsProps {
  availableProgramYears: ProgramYear[]
  selectedProgramYear: ProgramYear
  onProgramYearChange: (py: ProgramYear) => void
  availableDates: SnapshotDate[]
  selectedDate: SnapshotDate | undefined
  onDateChange: (date: SnapshotDate | undefined) => void
  freshness?: string | undefined
}

export const ContextSheetControls: React.FC<ContextSheetControlsProps> = () =>
  null
