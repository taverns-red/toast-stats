/* Where the retired `/district/:id/analytics` URL goes (#2159).

   The page's two top-10 lists (member growth, DCP goals) duplicated the Clubs
   table's sortable Trend and DCP columns, so an old link lands on Clubs sorted
   by net change, largest first. `sort` / `dir` are the keys DistrictClubsPage
   reads, and `netChange` is the Trend column's SortField. Every other param —
   `py`, `date` and anything else — carries through.

   `#education-awards` was the in-page anchor of the leaderboards that moved to
   Education (#1793); it still lands on them. Any other hash named a block that
   no longer exists, so it is dropped. */

export function analyticsRedirectTarget(
  districtId: string,
  search: string,
  hash: string
): string {
  if (hash === '#education-awards') {
    return `/district/${districtId}/education${search}#leaderboards`
  }
  const incoming = new URLSearchParams(search)
  // py/date first, then the sort, then anything else; a stale sort is replaced.
  const next = new URLSearchParams()
  for (const key of ['py', 'date']) {
    const value = incoming.get(key)
    if (value !== null) next.set(key, value)
  }
  next.set('sort', 'netChange')
  next.set('dir', 'desc')
  incoming.forEach((value, key) => {
    if (!['py', 'date', 'sort', 'dir'].includes(key)) next.append(key, value)
  })
  return `/district/${districtId}/clubs?${next.toString()}`
}
