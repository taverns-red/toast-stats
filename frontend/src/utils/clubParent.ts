/* The one parent of a club page (#2646, UNIT-07).

   The phone back arrow, the breadcrumb's parent crumb and the bottom link all
   lead to the same place: the area or division page the user opened the club
   from, when that page said so in router state (`fromEntity`), otherwise the
   district's club list, restoring the filters they came from
   (`fromClubsSearch`, #577). */

export interface ClubParent {
  label: string
  to: string
}

export interface ClubParentState {
  /** Set by an area or division page on its links to a club. */
  fromEntity?: ClubParent
  /** The clubs list's `location.search`, for the filter round-trip. */
  fromClubsSearch?: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/** The `fromEntity` of a navigation state, or undefined unless it is a label
 *  and a path inside this district (never an external or foreign URL). */
function readFromEntity(
  state: unknown,
  districtId: string
): ClubParent | undefined {
  if (!isRecord(state) || !isRecord(state['fromEntity'])) return undefined
  const { label, to } = state['fromEntity']
  if (typeof label !== 'string' || typeof to !== 'string') return undefined
  if (label === '' || !to.startsWith(`/district/${districtId}/`)) {
    return undefined
  }
  return { label, to }
}

export function resolveClubParent(
  districtId: string,
  state: unknown
): ClubParent {
  const fromEntity = readFromEntity(state, districtId)
  if (fromEntity) return fromEntity
  const search =
    isRecord(state) && typeof state['fromClubsSearch'] === 'string'
      ? state['fromClubsSearch']
      : ''
  return { label: 'Clubs', to: `/district/${districtId}/clubs${search}` }
}
