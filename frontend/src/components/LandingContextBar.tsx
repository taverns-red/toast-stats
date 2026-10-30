import React, { useState } from 'react'
import { ContextBar } from './ContextBar'
import { ContextSheetControls } from './ContextSheetControls'
import { formatFreshnessLine } from '../utils/contextBar'
import type { ProgramYear } from '../utils/programYear'
import type { SnapshotDate } from '../types/snapshotDate'
import type {
  ProgramYearSetter,
  SnapshotDateSetter,
} from '../hooks/useUrlProgramYear'

/* Phone context bar for the landing page (#1846, mobile epic #1827 Phase 2,
   review §7 item 19).

   Below 768 the landing's header stack — title, lede, the 4-line orientation
   paragraph, freshness/PY/date chips and Export/Share — put the first KPI at
   y=532 of 812. This bar replaces that stack (the one-line lede stays as a
   subtitle) (CSS keyed on `.context-bar ~
   .districts-page-header`), so search and the KPI lead the first screen. The
   orientation copy, the PY/date controls and the actions move into its sheet.

   A root page: no back crumb and no trail. Program year and date are props
   owned by the page (R3); the sheet calls the same setters as the desktop
   DataControlsBar, so the URL round-trip is identical. ≥768 the bar is hidden
   and the desktop header is unchanged. */

export interface LandingContextBarProps {
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: ProgramYearSetter
  availableProgramYears: ProgramYear[]
  cachedDates: SnapshotDate[]
  selectedDate: SnapshotDate | undefined
  setSelectedDate: SnapshotDateSetter
  effectiveDate: SnapshotDate | undefined
  asOfDate: string | undefined
  isLatestSnapshot: boolean
  /** The orientation copy (the desktop strip's sentence, phone-worded). */
  orientation: React.ReactNode
  /** Exports the visible rankings. Omitted while there is nothing to export
   *  (the loading/error shell). */
  onExportCsv?: (() => void) | undefined
}

const LandingSheetActions: React.FC<{
  onExportCsv?: (() => void) | undefined
}> = ({ onExportCsv }) => {
  const [copied, setCopied] = useState(false)
  const copyLink = async () => {
    try {
      if (!navigator.clipboard) return
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard unavailable (insecure context / denied): nothing to report.
    }
  }
  return (
    <>
      {onExportCsv && (
        <button
          type="button"
          className="context-sheet__action"
          onClick={onExportCsv}
        >
          Export CSV
        </button>
      )}
      <button
        type="button"
        className="context-sheet__action"
        onClick={() => void copyLink()}
      >
        Copy link
      </button>
      <span role="status" aria-live="polite" className="context-sheet__status">
        {copied ? 'Link copied' : ''}
      </span>
    </>
  )
}

export const LandingContextBar: React.FC<LandingContextBarProps> = ({
  selectedProgramYear,
  setSelectedProgramYear,
  availableProgramYears,
  cachedDates,
  selectedDate,
  setSelectedDate,
  effectiveDate,
  asOfDate,
  isLatestSnapshot,
  orientation,
  onExportCsv,
}) => (
  <ContextBar
    // #2256 — the H1's full text ("Find a district, club or region")
    // needs ~242px in the ~208px slot at 375 and ellipsised. The bar title
    // is presentational (aria-hidden); the H1 keeps the full name.
    title="Find a district"
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
    actions={<LandingSheetActions onExportCsv={onExportCsv} />}
    about={orientation}
  />
)

export default LandingContextBar
