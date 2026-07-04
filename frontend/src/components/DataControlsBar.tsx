import React from 'react'
import type { ProgramYear } from '../utils/programYear'
import { formatDisplayDate } from '../utils/dateFormatting'
import { computeFreshness } from '../utils/dataFreshness'

/* Tight horizontal cluster of three pill-styled controls — freshness
   pill, PY chip, date chip — shared by /districts and /district/:id. */

export interface DataControlsBarProps {
  /** The pinned snapshot date currently being viewed (the month-end during
   * closing). Also the fallback pill date when no as-of date is known. */
  latestSnapshotDate: string | undefined
  /** The "as of" date (sourceCsvDate) — shown in the pill when set, instead of
   * the pinned snapshot date (#1296). Falls back to latestSnapshotDate. */
  asOfDate?: string | undefined
  /** True when viewing the most recent available snapshot. DataControlsBar
   * derives the month-end reconciliation state itself via computeFreshness
   * (#1310) — a single source of truth so no consumer can render the pill in a
   * different freshness state than another. A finalized historical month-end
   * (isLatest=false) is never flagged as reconciling. */
  isLatest?: boolean
  availableProgramYears: ProgramYear[]
  selectedProgramYear: ProgramYear
  onProgramYearChange: (py: ProgramYear) => void
  availableDates: string[]
  selectedDate: string | undefined
  onDateChange: (date: string | undefined) => void
  /** #922 — true while the query feeding latestSnapshotDate is still in
   * flight. On a cold load the rankings query usually resolves first, so
   * without this the toolbar paints 2-chip and rewraps (one row shorter on
   * mobile) when the pill lands — a real-user CLS hit. While pending, the
   * pill's slot is reserved with an aria-hidden placeholder. */
  freshnessPending?: boolean
}

// min-h-[44px]: the WCAG 2.5.5 / handoff 44px touch-target floor (#886, epic
// #888 Sprint 2). The chip is a <label> with an inset-0 opacity-0 <select>
// overlay, so the overlay inherits the label's height — lifting the label to
// 44px lifts the real touch target in both engines (L111 family). Shared with
// the non-interactive freshness pill too, which keeps the control row at a
// uniform height.
const CHIP_BASE =
  'inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-full text-xs font-medium border bg-white border-gray-200 text-gray-700 theme-dark:bg-gray-800 theme-dark:border-gray-700 theme-dark:text-gray-200'

const FreshnessPill: React.FC<{
  date: string
  /** When set, the pill shows a month-end reconciliation state (#1296). */
  reconcilingMonthLabel?: string | undefined
}> = ({ date, reconcilingMonthLabel }) => {
  const reconciling = Boolean(reconcilingMonthLabel)
  return (
    <div
      data-testid="freshness-pill"
      data-reconciling={reconciling ? 'true' : undefined}
      className={CHIP_BASE}
      title={
        reconciling
          ? `${reconcilingMonthLabel} month-end reconciliation — figures update daily until finalized. As of ${formatDisplayDate(date)}.`
          : `Latest snapshot: ${date}`
      }
    >
      <span
        data-testid="freshness-dot"
        aria-hidden="true"
        className={`w-2 h-2 rounded-full ${reconciling ? 'bg-amber-500' : 'bg-green-500'}`}
      />
      <span>
        {reconciling
          ? `As of ${formatDisplayDate(date)} · month-end reconciliation`
          : `Data fresh · ${formatDisplayDate(date)}`}
      </span>
    </div>
  )
}

/** #922 — width of the pill-slot placeholder rendered while the snapshot
 * date is pending. Matches the rendered pill ("Data fresh · <Mon D, YYYY>",
 * measured 179px at 390px, both engines) so the toolbar's wrap geometry is
 * settled from the first loaded paint. The landing renderShell skeleton
 * pins the same width (ACTIONS_SKELETON_WIDTHS.freshnessPill). */
export const FRESHNESS_PILL_WIDTH = 179

const FreshnessPillSkeleton: React.FC = () => (
  <div
    data-testid="freshness-pill-skeleton"
    aria-hidden="true"
    className={CHIP_BASE}
    style={{ width: FRESHNESS_PILL_WIDTH }}
  />
)

/* Native <select> styled to look like a pill chip — keeps full keyboard
   a11y and platform popover behaviour without re-implementing dropdowns.
   The label uses focus-within ring styling so keyboard users still see
   focus when tabbing through the invisible select (WCAG 2.4.7). */
const ChipSelect: React.FC<{
  testId: string
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  display: React.ReactNode
  options: { value: string; label: string }[]
}> = ({ testId, ariaLabel, value, onChange, display, options }) => {
  const currentLabel = options.find(o => o.value === value)?.label
  return (
    <label
      data-testid={testId}
      className={`${CHIP_BASE} relative cursor-pointer hover:bg-gray-50 theme-dark:hover:bg-gray-700 focus-within:ring-2 focus-within:ring-tm-loyal-blue focus-within:ring-offset-1`}
    >
      <span>{display}</span>
      <span aria-hidden="true" className="text-gray-400">
        ▾
      </span>
      <select
        data-testid={`${testId}-select`}
        aria-label={currentLabel ? `${ariaLabel}: ${currentLabel}` : ariaLabel}
        value={value}
        onChange={e => onChange(e.target.value)}
        // appearance-none + min-h-[44px]: the <select> IS the touch target, and
        // inset-0 sizes it to the label's PADDING box (44px − 2px border = 42px,
        // measured in both engines on PR #943). The floor must live on the
        // select; appearance-none opts out of native sizing so WebKit honours
        // min-height (Lesson 111). opacity-0 keeps it invisible — the ▾ caret
        // above is the affordance.
        className="absolute inset-0 opacity-0 cursor-pointer appearance-none min-h-[44px]"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

const formatPyShort = (py: ProgramYear): string =>
  `PY ${py.year}–${(py.year + 1).toString().slice(-2)}`

export const DataControlsBar: React.FC<DataControlsBarProps> = ({
  latestSnapshotDate,
  asOfDate,
  isLatest = false,
  availableProgramYears,
  selectedProgramYear,
  onProgramYearChange,
  availableDates,
  selectedDate,
  onDateChange,
  freshnessPending = false,
}) => {
  const sortedDates = [...availableDates].sort((a, b) => b.localeCompare(a))
  // Single source of truth for the pill (#1310): derive the display date and
  // the month-end reconciliation state here so every consumer only supplies raw
  // facts (asOfDate, the pinned snapshotDate, isLatest) and can't drift.
  const freshness = computeFreshness({
    asOfDate,
    snapshotDate: latestSnapshotDate,
    isLatest,
  })
  const pillDate = freshness.displayDate
  const reconcilingMonthLabel = freshness.reconcilingMonthLabel

  return (
    <div
      role="toolbar"
      aria-label="Data controls"
      className="flex flex-wrap items-center gap-2"
    >
      {pillDate ? (
        <FreshnessPill
          date={pillDate}
          reconcilingMonthLabel={reconcilingMonthLabel}
        />
      ) : (
        freshnessPending && <FreshnessPillSkeleton />
      )}

      <ChipSelect
        testId="py-chip"
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
