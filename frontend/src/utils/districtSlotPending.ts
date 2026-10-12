/**
 * Is a district subpage's data slot still waiting for its data? (#1837)
 *
 * Every `/district/:id/<subpage>` keys its data queries on a date resolved
 * from the per-district snapshot index, and passes `null` (query disabled)
 * until that index lands. A disabled TanStack query reports
 * `isLoading: false`, so the old `isLoading && <Skeleton/>` arm painted
 * NOTHING for the whole date-index window — then the loaded content landed on
 * top of whatever was already on screen (CLS 0.20–0.30 on divisions,
 * analytics and action-list).
 *
 * Pending therefore spans both windows: the date index in flight, then the
 * dated query in flight. It ends on data, on an error (so the error state
 * renders), or on a date index that settled with no usable date (so a
 * district with no snapshots never shows a permanent skeleton).
 */
export interface DistrictSlotQuery {
  /** The slot's query has produced data. */
  hasData: boolean
  /** The slot's query failed. */
  isError: boolean
}

export interface DistrictDatesState {
  /** A program year and end date were resolved — the slot's query is enabled. */
  hasValidDates: boolean
  /** The per-district date index query is no longer pending. */
  datesSettled: boolean
}

export function isDistrictSlotPending(
  slot: DistrictSlotQuery,
  dates: DistrictDatesState
): boolean {
  if (slot.hasData || slot.isError) return false
  if (dates.hasValidDates) return true
  return !dates.datesSettled
}
