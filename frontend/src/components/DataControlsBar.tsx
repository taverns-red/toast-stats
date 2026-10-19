import React from 'react'
import type { ProgramYear } from '../utils/programYear'
import type { SnapshotDate } from '../types/snapshotDate'
import { formatDisplayDate } from '../utils/dateFormatting'
import { computeFreshness } from '../utils/dataFreshness'

/* Tight horizontal cluster — the freshness indicator, the PY picker and the
   date picker — shared by the club hero and every page header that carries
   the toolbar (landing, district, region(s), division, area, awards, clubs
   world/race). #2171: the indicator is plain text with its status dot, and
   the pickers are compact 32px controls; their look lives in
   styles/components/data-controls.css, re-toned on the club hero's navy. */

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
  availableDates: SnapshotDate[]
  selectedDate: SnapshotDate | undefined
  onDateChange: (date: SnapshotDate | undefined) => void
  /** #922 — true while the query feeding latestSnapshotDate is still in
   * flight. On a cold load the rankings query usually resolves first, so
   * without this the toolbar paints 2-chip and rewraps (one row shorter on
   * mobile) when the pill lands — a real-user CLS hit. While pending, the
   * pill's slot is reserved with an aria-hidden placeholder. */
  freshnessPending?: boolean
}

// min-h-[44px]: the WCAG 2.5.5 / handoff 44px touch-target floor (#886, epic
// #888 Sprint 2). Each item keeps a 44px-tall box — the picker is a <label>
// with an inset-0 opacity-0 <select> overlay, so the overlay inherits the
// label's height (L111 family) — while #2171 draws the VISIBLE control as a
// 32px face inside it. The freshness item shares the floor so the row keeps
// one height and the landing skeleton's wrap geometry holds.
const ITEM_BASE = 'relative inline-flex items-center min-h-[44px]'

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
      className={`${ITEM_BASE} data-controls__fresh`}
      title={
        reconciling
          ? `${reconcilingMonthLabel} month-end reconciliation — figures update daily until finalized. As of ${formatDisplayDate(date)}.`
          : `Latest snapshot: ${date}`
      }
    >
      <span
        data-testid="freshness-dot"
        aria-hidden="true"
        className={`data-controls__dot ${reconciling ? 'bg-amber-500' : 'bg-green-500'}`}
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
 * date is pending. Matches the rendered indicator ("Data fresh · <Mon D,
 * YYYY>": 179px as a pill; 145px as #2171's plain text, measured on the PR
 * preview at 768 and 1280, Chromium) so the toolbar's wrap geometry is
 * settled from the first loaded paint. The landing renderShell skeleton
 * pins the same width (ACTIONS_SKELETON_WIDTHS.freshnessPill). */
export const FRESHNESS_PILL_WIDTH = 145

const FreshnessPillSkeleton: React.FC = () => (
  <div
    data-testid="freshness-pill-skeleton"
    aria-hidden="true"
    className={ITEM_BASE}
    style={{ width: FRESHNESS_PILL_WIDTH }}
  />
)

/* Native <select> under a compact picker face — keeps full keyboard a11y and
   platform popover behaviour without re-implementing dropdowns. The face
   draws a focus ring from the label's :focus-within (data-controls.css), so
   keyboard users still see focus on the invisible select (WCAG 2.4.7). */
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
      className={`${ITEM_BASE} data-controls__picker cursor-pointer`}
    >
      <span className="data-controls__face">
        <span>{display}</span>
        <span aria-hidden="true" className="data-controls__caret">
          ▾
        </span>
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
      className="data-controls flex flex-wrap items-center gap-2"
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
        onChange={v => onDateChange(sortedDates.find(d => d === v))}
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
