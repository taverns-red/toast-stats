import React from 'react'
import type { ProgramYear } from '../utils/programYear'
import { formatDisplayDate } from '../utils/dateFormatting'

/* DataControlsBar (#529 / #528) — tight horizontal cluster of three
   pill-styled controls used on /districts and /district/:id:
   freshness pill · PY chip · date chip. */

export interface DataControlsBarProps {
  latestSnapshotDate: string | undefined
  availableProgramYears: ProgramYear[]
  selectedProgramYear: ProgramYear
  onProgramYearChange: (py: ProgramYear) => void
  availableDates: string[]
  selectedDate: string | undefined
  onDateChange: (date: string | undefined) => void
}

const CHIP_BASE =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200'

const FreshnessPill: React.FC<{ date: string }> = ({ date }) => (
  <div
    data-testid="freshness-pill"
    className={CHIP_BASE}
    title={`Latest snapshot: ${date}`}
  >
    <span
      data-testid="freshness-dot"
      aria-hidden="true"
      className="w-2 h-2 rounded-full bg-green-500"
    />
    <span>Data fresh · {formatDisplayDate(date)}</span>
  </div>
)

/* Native <select> styled to look like a pill chip — keeps full keyboard
   a11y and platform popover behaviour without re-implementing dropdowns. */
const ChipSelect: React.FC<{
  testId: string
  selectTestId: string
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  display: React.ReactNode
  options: { value: string; label: string }[]
}> = ({
  testId,
  selectTestId,
  ariaLabel,
  value,
  onChange,
  display,
  options,
}) => (
  <label
    data-testid={testId}
    className={`${CHIP_BASE} relative cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700`}
  >
    <span>{display}</span>
    <span aria-hidden="true" className="text-gray-400">
      ▾
    </span>
    <select
      data-testid={selectTestId}
      aria-label={ariaLabel}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="absolute inset-0 opacity-0 cursor-pointer"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
)

const formatPyShort = (py: ProgramYear): string =>
  `PY ${py.year}–${(py.year + 1).toString().slice(-2)}`

export const DataControlsBar: React.FC<DataControlsBarProps> = ({
  latestSnapshotDate,
  availableProgramYears,
  selectedProgramYear,
  onProgramYearChange,
  availableDates,
  selectedDate,
  onDateChange,
}) => {
  const sortedDates = [...availableDates].sort((a, b) => b.localeCompare(a))

  return (
    <div
      role="toolbar"
      aria-label="Data controls"
      className="flex flex-wrap items-center gap-2"
    >
      {latestSnapshotDate && <FreshnessPill date={latestSnapshotDate} />}

      <ChipSelect
        testId="py-chip"
        selectTestId="py-chip-select"
        ariaLabel="Program year"
        value={String(selectedProgramYear.year)}
        onChange={v => {
          const py = availableProgramYears.find(p => p.year === Number(v))
          if (py) onProgramYearChange(py)
        }}
        display={formatPyShort(selectedProgramYear)}
        options={availableProgramYears.map(py => ({
          value: String(py.year),
          label: formatPyShort(py),
        }))}
      />

      <ChipSelect
        testId="date-chip"
        selectTestId="date-chip-select"
        ariaLabel="Snapshot date"
        value={selectedDate ?? ''}
        onChange={v => onDateChange(v === '' ? undefined : v)}
        display={
          selectedDate ? formatDisplayDate(selectedDate) : 'Latest in PY'
        }
        options={[
          { value: '', label: 'Latest in PY' },
          ...sortedDates.map(d => ({
            value: d,
            label: formatDisplayDate(d) ?? d,
          })),
        ]}
      />
    </div>
  )
}
