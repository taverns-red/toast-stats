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

   Enter: a district id opens that district (the user typed "61": District
   61, not Club 61 — see enterTarget); otherwise a single EXACT match
   navigates; otherwise Enter keeps the list open rather than guessing — the
   highlighted row is still chosen with the arrow keys, the shared combobox
   contract. */

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

/** What Enter opens for `query` (review B1):
    1. a query that IS a district id opens that district — old clubs carry
       low numbers (Club 61) and regions 1–14 share theirs with districts,
       so "61" and "6" are never a single exact match on real data, and
       "find my district fast" is the page's primary job;
    2. otherwise the one entity the query names exactly;
    3. otherwise null — the list stays open and the arrow keys choose. */
function enterTarget(query: string, flat: SearchEntity[]): SearchEntity | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const district = flat.find(
    e => e.type === 'district' && e.id.toLowerCase() === q
  )
  if (district) return district
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
  // `focused` gates the lazy index fetch; `listOpen` is the list's own
  // state, so Escape can close the list while the field keeps focus
  // (review S5) and typing reopens it.
  const [focused, setFocused] = useState(false)
  const [listOpen, setListOpen] = useState(true)

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
    indexStatus,
    retryIndex,
  } = useOmniSearch({
    onSelect: selectEntity,
    // Escape (the hook's dismiss): first close the list, keeping focus and
    // the text; a second Escape clears the text. Never blur.
    onDismiss: () => {
      if (listOpen && hasQuery) setListOpen(false)
      else setQuery('')
    },
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

  // Tabbing away collapses the list too (focus leaving the container).
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      setFocused(false)
    }
  }

  // Enter navigates only on a single exact match, or on a row the user
  // highlighted with the arrow keys; otherwise the list stays open.
  const [armed, setArmed] = useState(false)
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setArmed(true)
    if (e.key === 'Enter' && !armed) {
      const target = enterTarget(query, flat)
      e.preventDefault()
      if (target) selectEntity(target)
      else setFocused(true)
      return
    }
    handleKeyDown(e)
  }

  const showResults = focused && hasQuery && listOpen
  const listboxOpen = showResults && !!index && flat.length > 0
  const optionId = (e: SearchEntity) => `${OPTION_PREFIX}-${e.type}-${e.id}`

  // One live region for what the list cannot show: loading, failure (with
  // a Retry — review S4: a rejected index load used to read "Searching…"
  // forever) and no matches. Absent while results are listed.
  const status =
    !showResults || listboxOpen
      ? null
      : indexStatus === 'error'
        ? 'error'
        : !index
          ? 'Searching…'
          : 'No matches.'

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
            setListOpen(true)
            setQuery(e.target.value)
          }}
          onFocus={() => {
            setFocused(true)
            setListOpen(true)
          }}
          onBlur={onBlur}
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
          {status === 'error' ? (
            <p
              role="status"
              aria-live="polite"
              className="command-palette__empty landing-search__status"
            >
              Could not load search.{' '}
              <button
                type="button"
                className="landing-search__retry"
                onMouseDown={e => e.preventDefault()}
                onClick={retryIndex}
              >
                Retry
              </button>
            </p>
          ) : status ? (
            <p
              role="status"
              aria-live="polite"
              className="command-palette__empty landing-search__status"
            >
              {status}
            </p>
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
