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

/* Colour lives in `.date-preset-chip` (district-changes.css), NOT in Tailwind
   gray utilities — R10, and this one was caught live rather than reasoned about.
   dark-mode.css intercepts the common utilities with `!important`
   (`[data-theme='dark'] .bg-gray-100 { background-color: #1e1b27 !important }`),
   so a `theme-dark:bg-gray-100` pressed chip lost its background in dark mode
   and rendered dark ink on a dark fill — its border and text flipped, its
   background did not.
   The redesign tokens remap light/dark together by design (Lessons 093/094), so
   one declaration — `background: var(--ink); color: var(--surface)` — is an
   inverted chip in BOTH themes, with nothing to keep in sync. */

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
              'date-preset-chip',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tm-loyal-blue focus-visible:ring-offset-1'
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
