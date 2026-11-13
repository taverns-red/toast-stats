// #2689: the landing rankings table (DataTable + TanStack Table) loads on its
// own chunk. DistrictsPage is in the entry chunk, so a static import would put
// that code on every route, the club page's Lighthouse budget included.
export const importDistrictRankingsTable = () =>
  import('../DistrictRankingsTable').then(m => ({
    default: m.DistrictRankingsTable,
  }))

/** Start fetching the chunk when the landing page mounts, so it lands with the data. */
export const preloadDistrictRankingsTable = (): void => {
  void importDistrictRankingsTable()
}
