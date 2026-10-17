import React, { useEffect, useState } from 'react'
import { useDebounce } from '../hooks/useDebounce'

/**
 * Visible club-name search box (#814). Mirrors the column TextFilter pattern:
 * a LOCAL input value keeps typing instant, while the heavy table re-filter is
 * driven off a 300ms-debounced value. Without the local/debounced split the
 * controlled input is gated on the 100+-row re-sort and drops fast keystrokes.
 *
 * `value` is the external `name`-filter value (URL on load, the column
 * dropdown, or Clear-all). It is pulled into the local input whenever it
 * changes externally; debounce coalescing means our own outbound writes settle
 * to the same value and don't fight the user mid-type.
 */
export const ClubSearchBox: React.FC<{
  value: string
  onSearchChange: (value: string) => void
  /** Shorter on phones, where the field shares its row (#1836). */
  placeholder?: string
  /** The field's accessible name (the region explorer also matches club
   *  numbers, #1808). */
  label?: string
}> = ({
  value,
  onSearchChange,
  placeholder = 'Search clubs by name…',
  label = 'Search clubs by name',
}) => {
  const [input, setInput] = useState(value)
  const debounced = useDebounce(input, 300)

  // Pull external changes (Clear-all, column dropdown, back/forward) back into
  // the local input. Render-phase sync (tracked-value compare) avoids
  // setState-in-effect — the established pattern here, see TextFilter (#340):
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [trackedValue, setTrackedValue] = useState(value)
  if (value !== trackedValue) {
    setTrackedValue(value)
    setInput(value)
  }

  // Push the settled input outward (filter + URL) when it diverges. Only push
  // once the debounce has SETTLED to the current input (`debounced === input`):
  // when an external clear (Clear-all) resets `value`→'' the render-phase sync
  // above sets `input`→'' while `debounced` still lags at the old text — pushing
  // that stale `debounced` would re-apply the filter we just cleared (#817).
  useEffect(() => {
    if (debounced === input && debounced !== value) onSearchChange(debounced)
  }, [debounced, input, value, onSearchChange])

  return (
    <div className="clubs-search">
      <svg
        className="clubs-search__icon"
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="search"
        className="clubs-search__input"
        placeholder={placeholder}
        aria-label={label}
        value={input}
        onChange={e => setInput(e.target.value)}
      />
      {input && (
        <button
          type="button"
          className="clubs-search__clear"
          aria-label="Clear search"
          onClick={() => setInput('')}
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default ClubSearchBox
