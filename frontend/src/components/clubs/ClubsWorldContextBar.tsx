import React from 'react'
import { ContextBar, type ContextCrumb } from '../ContextBar'
import { ContextSheetControls } from '../ContextSheetControls'
import { formatFreshnessLine } from '../../utils/contextBar'
import type { ProgramYear } from '../../utils/programYear'
import type { SnapshotDate } from '../../types/snapshotDate'
import type {
  ProgramYearSetter,
  SnapshotDateSetter,
} from '../../hooks/useUrlProgramYear'

/* Phone context bar for the clubs-worldwide pages (#1831): the overview
   (/clubs, a root page with no back crumb) and each tier's race
   (/clubs/race/:tier, back to the overview). Both pages own the same global
   program-year state (useProgramYearControls) and pass it in (R3). */

export interface ClubsWorldContextBarProps {
  title: string
  back?: { label: string; to: string } | undefined
  about: string
  trail: ContextCrumb[]
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: ProgramYearSetter
  availableProgramYears: ProgramYear[]
  cachedDates: SnapshotDate[]
  selectedDate: SnapshotDate | undefined
  setSelectedDate: SnapshotDateSetter
  effectiveDate: SnapshotDate | undefined
  asOfDate: string | undefined
  isLatestSnapshot: boolean
}

export const ClubsWorldContextBar: React.FC<ClubsWorldContextBarProps> = ({
  title,
  back,
  about,
  trail,
  selectedProgramYear,
  setSelectedProgramYear,
  availableProgramYears,
  cachedDates,
  selectedDate,
  setSelectedDate,
  effectiveDate,
  asOfDate,
  isLatestSnapshot,
}) => (
  <ContextBar
    title={title}
    back={back}
    programYear={selectedProgramYear}
    date={effectiveDate}
    controls={
      <ContextSheetControls
        availableProgramYears={availableProgramYears}
        selectedProgramYear={selectedProgramYear}
        onProgramYearChange={setSelectedProgramYear}
        availableDates={cachedDates}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        freshness={formatFreshnessLine({
          asOfDate: isLatestSnapshot ? asOfDate : undefined,
          snapshotDate: effectiveDate,
          isLatest: isLatestSnapshot,
        })}
      />
    }
    about={about}
    trail={trail}
  />
)

export default ClubsWorldContextBar
