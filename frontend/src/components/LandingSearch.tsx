/* LandingSearch (#2249) — the landing hero's "find anything" form.

   ONE engine, three presentations (Lesson 092 / R6): this is the same
   `useOmniSearch` + `OmniSearchResults` pair behind the header combobox and
   the Cmd-K palette, so districts, regions, clubs (live and closed, by name
   or number), divisions, areas and the worldwide pages are all reachable
   from the first field on the page. It differs only in presentation: a
   large field with a VISIBLE label (a placeholder is not a label), the
   page's primary job.

   Lazy: the ~1 MB club index is fetched on first focus, never at mount, so
   the landing's first load and script budget are untouched (the index is a
   fetch, not a chunk). The field's box is static, so the loading shell can
   render this same component as its own reserve — no drift, no CLS.

   Enter: a single EXACT match navigates (the user typed "61" and there is
   one District 61); otherwise Enter keeps the list open rather than guessing
   — the highlighted row is still chosen with the arrow keys, the shared
   combobox contract. */

import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOmniSearch } from '../hooks/useOmniSearch'
import OmniSearchResults from './AppShell/OmniSearchResults'
import { type SearchEntity } from '../services/searchIndex'

const LISTBOX_ID = 'landing-search-results'
const OPTION_PREFIX = 'landing-search-option'
const INPUT_ID = 'landing-search-input'

export const LANDING_SEARCH_LABEL = 'Find a district, club or region'

interface LandingSearchProps {
  /** The page's "/" shortcut focuses this input. */
  inputRef?: React.RefObject<HTMLInputElement | null>
}

/** The one entity the query names exactly, or null when it is ambiguous. */
function exactMatch(query: string, flat: SearchEntity[]): SearchEntity | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const exact = flat.filter(
    e => e.terms.includes(q) || e.exactTerms?.includes(q)
  )
  return exact.length === 1 ? exact[0]! : null
}

export const LandingSearch: React.FC<LandingSearchProps> = ({ inputRef }) => {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const ownRef = useRef<HTMLInputElement>(null)
  // The page may hand in the ref its "/" shortcut focuses; otherwise ours.
  const ref = inputRef ?? ownRef
  const [focused, setFocused] = useState(false)

  // Plain functions: the React Compiler memoizes them (a manual useCallback
  // over `ref.current` is what it refuses to preserve).
  const dismiss = () => {
    setFocused(false)
    ref.current?.blur()
  }

  const selectEntity = (entity: SearchEntity) => {
    navigate(entity.route)
    dismiss()
  }

  const {
    query,
    setQuery,
    index,
    groups,
    flat,
    activeIndex,
    setActiveIndex,
    activeEntity,
    hasQuery,
    handleKeyDown,
  } = useOmniSearch({
    onSelect: selectEntity,
    onDismiss: dismiss,
    enabled: focused,
  })

  // Outside-click collapses the list; bound only while open.
  useEffect(() => {
    if (!focused) return
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setFocused(false)
        ref.current?.blur()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [focused, ref])

  // Enter navigates only on a single exact match, or on a row the user
  // highlighted with the arrow keys; otherwise the list stays open.
  const [armed, setArmed] = useState(false)
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setArmed(true)
    if (e.key === 'Enter' && !armed) {
      const exact = exactMatch(query, flat)
      e.preventDefault()
      if (exact) selectEntity(exact)
      else setFocused(true)
      return
    }
    handleKeyDown(e)
  }

  const showResults = focused && hasQuery
  const listboxOpen = showResults && !!index && flat.length > 0
  const optionId = (e: SearchEntity) => `${OPTION_PREFIX}-${e.type}-${e.id}`

  return (
    <div className="landing-search" ref={containerRef}>
      <label htmlFor={INPUT_ID} className="landing-search__label">
        {LANDING_SEARCH_LABEL}
      </label>
      <div className="landing-search__field">
        <svg
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="landing-search__icon"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          id={INPUT_ID}
          ref={ref}
          type="text"
          role="combobox"
          value={query}
          onChange={e => {
            setArmed(false)
            setQuery(e.target.value)
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder="District number, club name or number, region…"
          aria-autocomplete="list"
          aria-expanded={listboxOpen}
          aria-controls={listboxOpen ? LISTBOX_ID : undefined}
          aria-activedescendant={
            listboxOpen && activeEntity ? optionId(activeEntity) : undefined
          }
          autoComplete="off"
          className="landing-search__input"
        />
      </div>
      {showResults && (
        <div className="landing-search__results">
          {!index ? (
            <p className="command-palette__empty">Searching…</p>
          ) : flat.length === 0 ? (
            <p className="command-palette__empty">No matches.</p>
          ) : (
            <OmniSearchResults
              groups={groups}
              activeIndex={activeIndex}
              onActivate={setActiveIndex}
              onSelect={dismiss}
              listboxId={LISTBOX_ID}
              idPrefix={OPTION_PREFIX}
            />
          )}
        </div>
      )}
    </div>
  )
}
