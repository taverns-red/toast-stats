import { formatLongDate } from './dateFormatting'

/** Ron's note for a closed club filed under a retired district. The id is
 *  printed as the row label and club hero print it, so "09" stays "09"
 *  (rollupReinstate.test: "names the district as its row label does"). */
export function retiredDistrictNote(
  districtId: string,
  retiredOn: string
): string {
  return `District ${districtId} was retired on ${formatLongDate(retiredOn)}.`
}
