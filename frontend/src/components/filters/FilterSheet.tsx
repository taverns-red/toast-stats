import React, { useId } from 'react'
import { BottomSheet } from '../BottomSheet'

/* Filter & sort sheet (#1836, mobile epic #1827 Phase 1, review §5.4).

   The phone's one filter surface, shared by every list (clubs now; the map
   #1784/#1788 and explorers #1808/#1809 next). It is generic: the caller owns
   the state (in the URL) and passes facets + sort in; this only renders them
   on the BottomSheet primitive, which carries the modal contract (focus trap,
   Escape, backdrop, swipe, scroll lock, focus return).

   - Sort first: a labelled select + Ascending/Descending (aria-pressed).
   - Facets are aria-pressed chips. Nothing pressed = no filter, so the first
     tap always means "only this" — no select-all ambiguity (Lesson: a
     select-all default makes toggle semantics ambiguous).
   - Every tap is ONE onChange with the next whole set (one setter per
     handler), so coupled URL params never race.
   - Changes apply live; the sticky "Show N clubs" button reports the live
     count and closes. "Clear all" clears every filter in one call. */

export interface FilterSheetOption {
  value: string
  label: string
}

export interface FilterSheetFacet {
  id: string
  label: string
  options: FilterSheetOption[]
  selected: string[]
  onChange: (next: string[]) => void
}

export interface FilterSheetSort {
  options: FilterSheetOption[]
  field: string
  direction: 'asc' | 'desc'
  onChange: (field: string, direction: 'asc' | 'desc') => void
}

export interface FilterSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Rows the current filters leave — shown live on the apply button. */
  resultCount: number
  resultNoun: { one: string; other: string }
  /** Active filters (drives "Clear all"). */
  activeCount: number
  onClearAll: () => void
  sort?: FilterSheetSort
  facets: FilterSheetFacet[]
  /** DOM id for the dialog, for the trigger's `aria-controls`. */
  id?: string
}

/** The facet chip groups, without the sheet: also rendered inline where a
 *  wider screen has room for them (the map's side panel, #1788). */
export const FilterFacetGroups: React.FC<{ facets: FilterSheetFacet[] }> = ({
  facets,
}) => {
  const groupId = useId()
  const toggle = (facet: FilterSheetFacet, value: string) => {
    const on = facet.selected.includes(value)
    facet.onChange(
      on ? facet.selected.filter(v => v !== value) : [...facet.selected, value]
    )
  }
  return (
    <>
      {facets
        .filter(f => f.options.length > 0)
        .map(facet => (
          <section key={facet.id} className="filter-sheet__section">
            <div
              role="group"
              aria-labelledby={`${groupId}-${facet.id}`}
              className="filter-sheet__facet"
            >
              <h3 id={`${groupId}-${facet.id}`} className="filter-sheet__label">
                {facet.label}
              </h3>
              <div className="filter-sheet__chips">
                {facet.options.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    className="filter-sheet__chip"
                    aria-pressed={facet.selected.includes(o.value)}
                    onClick={() => toggle(facet, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ))}
    </>
  )
}

const DIRECTIONS: { value: 'asc' | 'desc'; label: string }[] = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
]

export const FilterSheet: React.FC<FilterSheetProps> = ({
  isOpen,
  onClose,
  resultCount,
  resultNoun,
  activeCount,
  onClearAll,
  sort,
  facets,
  id,
}) => {
  const sortId = useId()

  const noun = resultCount === 1 ? resultNoun.one : resultNoun.other

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filter & sort"
      closeLabel="Close filter and sort"
      {...(id ? { id } : {})}
    >
      <div className="filter-sheet">
        {sort && (
          <section className="filter-sheet__section">
            <label htmlFor={sortId} className="filter-sheet__label">
              Sort by
            </label>
            <div className="filter-sheet__sort">
              <select
                id={sortId}
                className="filter-sheet__select"
                value={sort.field}
                onChange={e => sort.onChange(e.target.value, sort.direction)}
              >
                {sort.options.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div
                className="filter-sheet__chips"
                role="group"
                aria-label="Sort direction"
              >
                {DIRECTIONS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    className="filter-sheet__chip"
                    aria-pressed={sort.direction === d.value}
                    onClick={() => sort.onChange(sort.field, d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <FilterFacetGroups facets={facets} />

        <div className="filter-sheet__footer">
          <button
            type="button"
            className="filter-sheet__clear"
            onClick={onClearAll}
            disabled={activeCount === 0}
          >
            Clear all
          </button>
          <button
            type="button"
            className="filter-sheet__apply"
            onClick={onClose}
          >
            Show {resultCount} {noun}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

export default FilterSheet
