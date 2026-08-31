import { cn } from '../utils/cn'
import { CHIP_LAYOUT } from './DatePairPicker'
import {
  DATE_PAIR_PRESETS,
  resolveDatePairPreset,
} from '../utils/datePairPresets'

/* Time-window preset chips for the "What Changed" digest (#1462, epic #1458
   Sprint 4).

   One tap for the questions a district leader actually asks — "what changed
   last week / last month / since July 1?" — instead of scrolling a 100+ entry
   dropdown twice. Every chip is a pure derivation over the recorded dates the
   page already loaded: no new fetch, and no new URL param, so a shared link
   stays a plain `?from=…&to=…` date pair.

   Semantics: toggle buttons with `aria-pressed`, never `role="tab"`. Nothing
   here swaps a panel — the chips narrow which two snapshots the one persistent
   digest compares, which is exactly what `aria-pressed` announces (Lesson 128).

   A window with no recorded date to anchor it is DISABLED, not silently
   widened: a chip that picks a date with no snapshot, or that collapses onto
   `to` and renders an all-zero digest, is the failure this page keeps paying
   for. See `utils/datePairPresets.ts` for the resolution model. */

export interface DatePairPresetChipsProps<T extends string = string> {
  /** The district's recorded snapshot dates (the page's already-loaded list). */
  dates: readonly T[]
  /** The pair currently in effect — owned by the page (R3), never re-derived. */
  from: T | undefined
  to: T | undefined
  /**
   * Reports a resolved pair. BOTH ends in one call: the page writes them in a
   * single URL update (`useUrlDatePair.setPair`), because two sequential
   * setters would drop one key.
   */
  onSelect: (from: T, to: T) => void
}

/** Pressed: an inverted chip. High contrast in both themes without leaning on
 *  an opacity-variant token (those bake in hardcoded rgba and need their own
 *  dark override — R10). */
const CHIP_PRESSED =
  'bg-gray-900 border-gray-900 text-white theme-dark:bg-gray-100 theme-dark:border-gray-100 theme-dark:text-gray-900'

const CHIP_RESTING =
  'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 theme-dark:bg-gray-800 theme-dark:border-gray-700 theme-dark:text-gray-200 theme-dark:hover:bg-gray-700'

const CHIP_DISABLED =
  'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed theme-dark:bg-gray-900 theme-dark:border-gray-800 theme-dark:text-gray-600'

export function DatePairPresetChips<T extends string>({
  dates,
  from,
  to,
  onSelect,
}: DatePairPresetChipsProps<T>) {
  const chips = DATE_PAIR_PRESETS.map(preset => ({
    ...preset,
    pair: resolveDatePairPreset(preset.id, dates),
  }))

  // Nothing to offer at all (a single recorded date) — the page already
  // explains that case in prose, so don't render an empty control group.
  if (chips.every(chip => chip.pair === null)) return null

  return (
    <div
      role="group"
      aria-label="Time window"
      className="flex flex-wrap items-center gap-2"
      data-testid="changes-preset-chips"
    >
      {chips.map(({ id, label, description, pair }) => {
        const pressed = !!pair && pair.from === from && pair.to === to
        return (
          <button
            key={id}
            type="button"
            data-testid={`changes-preset-${id}`}
            aria-pressed={pressed}
            disabled={pair === null}
            title={
              pair === null
                ? `${description} — not enough recorded history`
                : description
            }
            className={cn(
              CHIP_LAYOUT,
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tm-loyal-blue focus-visible:ring-offset-1',
              pair === null
                ? CHIP_DISABLED
                : pressed
                  ? CHIP_PRESSED
                  : CHIP_RESTING
            )}
            onClick={() => {
              if (pair) onSelect(pair.from, pair.to)
            }}
          >
            <span data-chip-label>{label}</span>
            {/* The visible label ("~1 week") is too terse to stand alone as an
                accessible name, but must still START the name so voice control
                ("click ~1 week") keeps working — WCAG 2.5.3. So the label leads
                and the explanation follows, in the same button. */}
            <span className="sr-only">
              {pair === null
                ? `${description} — not enough recorded history`
                : description}
            </span>
          </button>
        )
      })}
    </div>
  )
}
