/* OmniSearchResults (epic #1055 Sprint 3, #1058) — the grouped ARIA listbox
   shared by the modal palette and the desktop header combobox. Presentational:
   it renders the result groups it is handed and reports hover/click; all state
   (query, active row, index load) lives in the caller via useOmniSearch.

   Each mount gets a distinct `listboxId`/`optionId` prefix so two instances can
   coexist in the DOM with valid, non-colliding ARIA ids. */

import React from 'react'
import { Link } from 'react-router-dom'
import {
  type SearchEntity,
  type SearchEntityType,
  type SearchResultGroup,
} from '../../services/searchIndex'
import { DistrictChipAndName } from '../DistrictChipAndName'
import { hasDescriptiveName } from '../../utils/districtName'

// Human-readable group headings, in the index's canonical group order.
const GROUP_LABEL: Record<SearchEntityType, string> = {
  district: 'Districts',
  region: 'Regions',
  club: 'Clubs',
  division: 'Divisions',
  area: 'Areas',
  page: 'Pages',
}

interface OmniSearchResultsProps {
  groups: SearchResultGroup[]
  /** Already-clamped flat index of the highlighted row. */
  activeIndex: number
  onActivate: (flatIndex: number) => void
  /** Notification (no payload) that a result was chosen — callers close the
      surface here; navigation is handled by the result's own <Link>. */
  onSelect: () => void
  listboxId: string
  /** Prefix for each option's element id (must be unique per mount). */
  idPrefix: string
  /** The typed query, so a row can say why it matched (a club found by its
      number shows "Club 61", #2652). */
  query?: string
}

const OmniSearchResults: React.FC<OmniSearchResultsProps> = ({
  groups,
  activeIndex,
  onActivate,
  onSelect,
  listboxId,
  idPrefix,
  query = '',
}) => {
  const optionId = (e: SearchEntity) => `${idPrefix}-${e.type}-${e.id}`
  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Search results"
      className="command-palette__results"
    >
      {groups.map((group, gi) => {
        // Flat index of this group's first entity — groups render in the same
        // order they were flattened, so position gives the flat index directly.
        const offset = groups
          .slice(0, gi)
          .reduce((n, g) => n + g.entities.length, 0)
        return (
          <li
            key={group.type}
            role="group"
            aria-label={GROUP_LABEL[group.type]}
            className="command-palette__group"
          >
            <div className="command-palette__group-heading" aria-hidden="true">
              {GROUP_LABEL[group.type]}
            </div>
            <ul role="presentation" className="command-palette__group-list">
              {group.entities.map((entity, ei) => {
                const flatIdx = offset + ei
                const active = flatIdx === activeIndex
                return (
                  <li
                    key={optionId(entity)}
                    role="option"
                    aria-selected={active}
                    id={optionId(entity)}
                    onMouseEnter={() => onActivate(flatIdx)}
                    className={
                      'command-palette__result' +
                      (active ? ' command-palette__result--active' : '')
                    }
                  >
                    <Link
                      to={entity.route}
                      onClick={onSelect}
                      className="command-palette__result-link"
                    >
                      {renderEntity(entity, query)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

// A numeric query that matched a club on its number: the number is never
// otherwise shown, so "61" listing clubs from other districts looked random
// (#2652). Digits only, leading zeros ignored (club ids are zero-padded).
function clubNumberContext(entity: SearchEntity, query: string) {
  if (entity.type !== 'club') return entity.context
  const q = query.trim().replace(/^0+(?=\d)/, '')
  if (!/^\d+$/.test(q)) return entity.context
  const number = entity.id.replace(/^0+(?=\d)/, '')
  if (!number.includes(q)) return entity.context
  return entity.context
    ? `Club ${number} · ${entity.context}`
    : `Club ${number}`
}

// District results reuse the chip+name treatment (and its #522 no-duplicate
// guard); regions and clubs render their label plus disambiguation context.
//
// A district that no longer exists (#1403) adds the SAME muted context slot
// the other types already use, saying when its data stops. Deliberately not
// new chrome — no badge, no colour, no icon, no new CSS class. The union makes
// 68 historical districts findable; this note is what keeps "no longer exists"
// from reading as "exists", so nobody is surprised that D27 ends at
// 2026-06-30. It is real text inside the option, so it is announced with the
// row rather than hidden behind a visual-only cue.
function renderEntity(entity: SearchEntity, query: string) {
  if (entity.type === 'district') {
    return (
      <>
        <DistrictChipAndName
          districtId={entity.id}
          name={entity.label}
          chipClassName="command-palette__result-num"
          nameClassName="command-palette__result-name"
        />
        {/* Most districts are named by their bare number, so the chip alone
            reads as a code: say "District 61" (#2652). */}
        {!hasDescriptiveName(entity.label) && (
          <span className="command-palette__result-name">
            District {entity.id}
          </span>
        )}
        {entity.inactive && entity.context && (
          <span className="command-palette__result-region">
            {entity.context}
          </span>
        )}
      </>
    )
  }
  const context = clubNumberContext(entity, query)
  return (
    <>
      <span className="command-palette__result-name">{entity.label}</span>
      {context && (
        <span className="command-palette__result-region">{context}</span>
      )}
    </>
  )
}

export { GROUP_LABEL }
export default OmniSearchResults
