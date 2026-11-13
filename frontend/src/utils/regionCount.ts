/* How the site counts regions (#2653, decision D11).

   Toastmasters numbers 14 regions, and a handful of districts sit in none of
   them (TI's "DNAR": district, not assigned a region). Saying only "14
   regions" hides those districts, so wherever the site counts regions it adds
   them: "14 regions + 3 districts not assigned". Both numbers come from the
   data the page already holds (R3: the caller passes them in); the 14 and the
   3 are never literals. With none unassigned, it is just "14 regions". */

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** Districts whose region is not a number (TI's "DNAR" and any non-numeric
    placeholder): the ones no numbered region holds. */
export function countUnassignedDistricts(
  rows: ReadonlyArray<{ region: string }>
): number {
  return rows.filter(r => !/^\d+$/.test(r.region)).length
}

/** "14 regions" or "14 regions + 3 districts not assigned". */
export function formatRegionCount(regions: number, unassigned: number): string {
  const base = plural(regions, 'region', 'regions')
  return unassigned > 0
    ? `${base} + ${plural(unassigned, 'district', 'districts')} not assigned`
    : base
}
