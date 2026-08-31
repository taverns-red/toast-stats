import { formatDisplayDate } from '../utils/dateFormatting'

/* From/To date-pair picker for the "What Changed" digest (#794, epic #797
   Sprint 2). Mirrors DataControlsBar's chip pattern: a visible pill label with
   an invisible full-bleed native <select> on top — full keyboard a11y and the
   platform popover, and the label (not the select) is the touch target, so the
   44px minimum holds in WebKit too (Lesson 111). Offers only the dates this
   district actually recorded; selections are reported up (the page owns the
   pair, R3). */

/**
 * Generic in the date type so a branded `SnapshotDate[]` round-trips through the
 * picker still branded (#1323): every value it emits is an ELEMENT of `dates`,
 * narrowed from the offered options rather than re-read off the <select>.
 */
export interface DatePairPickerProps<T extends string = string> {
  /** Ascending list of the district's recorded snapshot dates. */
  dates: readonly T[]
  from: T | undefined
  to: T | undefined
  onFromChange: (date: T) => void
  onToChange: (date: T) => void
}

// min-h-[44px]: the WCAG 2.5.5 / handoff 44px touch-target floor (#886, epic
// #888 Sprint 2). The label is the touch target (an inset-0 opacity-0 <select>
// overlays it), so lifting the label to 44px lifts the real target in both
// engines (L111 family) — audit #885 measured these chips at 34px.
/**
 * Shape + size only, deliberately colourless — the sibling time-window preset
 * chips (#1462) reuse this and supply their own state colours. Keeping colour
 * out of the layout string is what makes that safe: Tailwind resolves
 * conflicting utilities by CSS source order, not by string order, so
 * `${CHIP_LAYOUT} bg-gray-900` cannot be silently beaten by a `bg-white`
 * sitting further left in the same string.
 */
export const CHIP_LAYOUT =
  'inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-full text-xs font-medium border'

/** The resting surface a picker chip wears. */
export const CHIP_SURFACE =
  'bg-white border-gray-200 text-gray-700 theme-dark:bg-gray-800 theme-dark:border-gray-700 theme-dark:text-gray-200'

const CHIP_BASE = `${CHIP_LAYOUT} ${CHIP_SURFACE}`

function DateChipSelect<T extends string>({
  testId,
  label,
  value,
  options,
  onChange,
}: {
  testId: string
  label: string
  value: T | undefined
  options: readonly T[]
  onChange: (value: T) => void
}) {
  return (
    <label
      data-testid={testId}
      className={`${CHIP_BASE} relative cursor-pointer hover:bg-gray-50 theme-dark:hover:bg-gray-700 focus-within:ring-2 focus-within:ring-tm-loyal-blue focus-within:ring-offset-1`}
    >
      <span className="text-gray-400 theme-dark:text-gray-500">{label}</span>
      <span>{value ? formatDisplayDate(value) : '—'}</span>
      <span aria-hidden="true" className="text-gray-400">
        ▾
      </span>
      <select
        data-testid={`${testId}-select`}
        aria-label={
          value ? `${label} date: ${formatDisplayDate(value)}` : `${label} date`
        }
        value={value ?? ''}
        onChange={e => {
          const picked = options.find(o => o === e.target.value)
          if (picked !== undefined) onChange(picked)
        }}
        // appearance-none + min-h-[44px]: the <select> IS the touch target, and
        // inset-0 sizes it to the label's PADDING box (44px − 2px border = 42px,
        // measured in both engines on PR #943). The floor must live on the
        // select; appearance-none opts out of native sizing so WebKit honours
        // min-height (Lesson 111). opacity-0 keeps it invisible.
        className="absolute inset-0 opacity-0 cursor-pointer appearance-none min-h-[44px]"
      >
        {options.map(d => (
          <option key={d} value={d}>
            {formatDisplayDate(d)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DatePairPicker<T extends string>({
  dates,
  from,
  to,
  onFromChange,
  onToChange,
}: DatePairPickerProps<T>) {
  // Newest first in the dropdown — the recent dates are the common pick.
  const sorted = [...dates].sort((a, b) => b.localeCompare(a))
  return (
    <div
      role="group"
      aria-label="Compare dates"
      className="flex flex-wrap items-center gap-2"
      data-testid="changes-date-pair-picker"
    >
      <DateChipSelect
        testId="changes-from-chip"
        label="From"
        value={from}
        options={sorted}
        onChange={onFromChange}
      />
      <span aria-hidden="true" className="text-gray-400">
        →
      </span>
      <DateChipSelect
        testId="changes-to-chip"
        label="To"
        value={to}
        options={sorted}
        onChange={onToChange}
      />
    </div>
  )
}
