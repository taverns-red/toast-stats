import React from 'react'
import type { ProgramYear } from '../utils/programYear'

/* DataControlsBar (#529 / #528) — tight horizontal cluster of three
   pill-styled controls used on /districts and /district/:id:
   freshness pill · PY chip · date chip. STUB — implementation in GREEN. */

export interface DataControlsBarProps {
  latestSnapshotDate: string | undefined
  availableProgramYears: ProgramYear[]
  selectedProgramYear: ProgramYear
  onProgramYearChange: (py: ProgramYear) => void
  availableDates: string[]
  selectedDate: string | undefined
  onDateChange: (date: string | undefined) => void
}

export const DataControlsBar: React.FC<DataControlsBarProps> = () => {
  return null
}
