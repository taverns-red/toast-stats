/**
 * Club category lists in `snapshots/{date}/analytics/district_{id}_analytics.json`
 * (#1901 option B).
 *
 * `vulnerableClubs`, `thrivingClubs` and `interventionRequiredClubs` were
 * written as full copies of their `allClubs` records — about half of the file.
 * The slim file shape carries clubId lists instead (`vulnerableClubIds`, …);
 * readers expand them back against `allClubs`.
 *
 * Both shapes are live: files written before the change keep the full arrays,
 * so `expandDistrictAnalyticsClubLists` passes a full-shape file through.
 */

interface WithClubId {
  clubId: string
}

/** [full array key, slim id-list key] */
export const DISTRICT_ANALYTICS_CLUB_LISTS = [
  ['vulnerableClubs', 'vulnerableClubIds'],
  ['thrivingClubs', 'thrivingClubIds'],
  ['interventionRequiredClubs', 'interventionRequiredClubIds'],
] as const

type FullListKey = (typeof DISTRICT_ANALYTICS_CLUB_LISTS)[number][0]
type IdListKey = (typeof DISTRICT_ANALYTICS_CLUB_LISTS)[number][1]

/** The analytics `data` object with the category arrays as full records. */
export type FullDistrictAnalyticsClubLists<C extends WithClubId> = {
  allClubs: C[]
} & Record<FullListKey, C[]>

/** The analytics `data` object as written since #1901: id lists. */
export type SlimDistrictAnalyticsClubLists<C extends WithClubId> = {
  allClubs: C[]
} & Record<IdListKey, string[]>

/** `T` (a full-shape analytics object) as written to the file. */
export type SlimDistrictAnalytics<T> = Omit<T, FullListKey> &
  Record<IdListKey, string[]>

/**
 * Writer side: replace each category array with its clubIds. Throws if a
 * categorized club is not in `allClubs`, since the reader could not resolve it.
 */
export function slimDistrictAnalyticsClubLists<
  T extends FullDistrictAnalyticsClubLists<WithClubId>,
>(analytics: T): SlimDistrictAnalytics<T> {
  const known = new Set(analytics.allClubs.map(c => c.clubId))
  const rest: Record<string, unknown> = { ...analytics }
  for (const [fullKey, idKey] of DISTRICT_ANALYTICS_CLUB_LISTS) {
    const ids = analytics[fullKey].map(c => c.clubId)
    const missing = ids.filter(id => !known.has(id))
    if (missing.length > 0) {
      throw new Error(
        `${fullKey} has clubs not in allClubs: ${missing.join(', ')}`
      )
    }
    delete rest[fullKey]
    rest[idKey] = ids
  }
  return rest as SlimDistrictAnalytics<T>
}

/**
 * Reader side: resolve id lists to the `allClubs` records (same object
 * references). A full-shape file is returned unchanged. An id with no
 * `allClubs` record is dropped.
 */
export function expandDistrictAnalyticsClubLists<
  T extends { allClubs: WithClubId[] },
>(analytics: T): Omit<T, IdListKey> & Record<FullListKey, T['allClubs']> {
  const file = analytics as T & Partial<Record<IdListKey, string[]>>
  if (!DISTRICT_ANALYTICS_CLUB_LISTS.some(([, idKey]) => idKey in file)) {
    return analytics as unknown as Omit<T, IdListKey> &
      Record<FullListKey, T['allClubs']>
  }
  const byId = new Map(analytics.allClubs.map(c => [c.clubId, c]))
  const out: Record<string, unknown> = { ...analytics }
  for (const [fullKey, idKey] of DISTRICT_ANALYTICS_CLUB_LISTS) {
    const ids = file[idKey] ?? []
    delete out[idKey]
    out[fullKey] = ids.flatMap(id => {
      const c = byId.get(id)
      return c ? [c] : []
    })
  }
  return out as Omit<T, IdListKey> & Record<FullListKey, T['allClubs']>
}
