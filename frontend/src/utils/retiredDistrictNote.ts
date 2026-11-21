/** Ron's note for a closed club filed under a retired district. The id is
 *  printed as the row label and club hero print it, so "09" stays "09"
 *  (rollupReinstate.test: "names the district as its row label does").
 *  Toastmasters retires districts on July 1, so only the year is read. */
export function retiredDistrictNote(
  districtId: string,
  retiredOn: string
): string {
  return `District ${districtId} was retired on July 1, ${retiredOn.slice(0, 4)}.`
}
