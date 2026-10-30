import React, { useId } from 'react'
import { formatDisplayDate } from '../utils/dateFormatting'
import type { ProgramYear } from '../utils/programYear'
import type { SnapshotDate } from '../types/snapshotDate'
import type {
  ProgramYearSetter,
  SnapshotDateSetter,
} from '../hooks/useUrlProgramYear'
import { USER_PICK } from '../hooks/useUrlProgramYear'

/* Program-year + snapshot-date controls for the context sheet (#1831).

   Visible <label>s and real native <select>s (no pill overlay): inside a
   sheet there is room to say what each control is, and the selects carry a
   16px font so iOS does not zoom on focus (review §7 gate). They call the
   SAME setters the desktop DataControlsBar calls, so the URL round-trip is
   identical (R3: values in, setters in — nothing derived here). */

export interface ContextSheetControlsProps {
  availableProgramYears: ProgramYear[]
  selectedProgramYear: ProgramYear
  /** Called with `USER_PICK` — a pick pushes a history entry (#2412). */
  onProgramYearChange: ProgramYearSetter
  availableDates: SnapshotDate[]
  selectedDate: SnapshotDate | undefined
  /** Called with `USER_PICK` — a pick pushes a history entry (#2412). */
  onDateChange: SnapshotDateSetter
  /** Optional freshness line ("Data fresh · Oct 10, 2026"). */
  freshness?: string | undefined
}

const formatPyLong = (py: ProgramYear): string =>
  `PY ${py.year}–${String(py.year + 1).slice(-2)}`

export const ContextSheetControls: React.FC<ContextSheetControlsProps> = ({
  availableProgramYears,
  selectedProgramYear,
  onProgramYearChange,
  availableDates,
  selectedDate,
  onDateChange,
  freshness,
}) => {
  const pyId = useId()
  const dateId = useId()
  const sortedDates = [...availableDates].sort((a, b) => b.localeCompare(a))
  // The selected year is always offered, even before the index resolves.
  const years = availableProgramYears.some(
    p => p.year === selectedProgramYear.year
  )
    ? availableProgramYears
    : [selectedProgramYear, ...availableProgramYears]

  return (
    <div className="context-sheet__controls">
      <div className="context-sheet__field">
        <label htmlFor={pyId} className="context-sheet__label">
          Program year
        </label>
        <select
          id={pyId}
          className="context-sheet__select"
          data-testid="context-sheet-py"
          value={String(selectedProgramYear.year)}
          onChange={e => {
            const py = years.find(p => p.year === Number(e.target.value))
            if (py) onProgramYearChange(py, USER_PICK)
          }}
        >
          {years.map(py => (
            <option key={py.year} value={String(py.year)}>
              {formatPyLong(py)}
            </option>
          ))}
        </select>
      </div>
      <div className="context-sheet__field">
        <label htmlFor={dateId} className="context-sheet__label">
          Snapshot date
        </label>
        <select
          id={dateId}
          className="context-sheet__select"
          data-testid="context-sheet-date"
          value={selectedDate ?? ''}
          onChange={e =>
            onDateChange(
              sortedDates.find(d => d === e.target.value),
              USER_PICK
            )
          }
        >
          <option value="">Latest in PY</option>
          {sortedDates.map(d => (
            <option key={d} value={d}>
              {formatDisplayDate(d)}
            </option>
          ))}
        </select>
      </div>
      {freshness && (
        <p
          className="context-sheet__freshness"
          data-testid="context-sheet-freshness"
        >
          {freshness}
        </p>
      )}
    </div>
  )
}

export default ContextSheetControls
