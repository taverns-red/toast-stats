/**
 * Accessible name for the rankings table's scroll region (#1358).
 *
 * The label used to promise "scroll horizontally to see all metrics"
 * unconditionally. Below the column-priority breakpoints the shed columns are
 * `display: none`, NOT off-screen — so on the very screens where a user most
 * needs those metrics, the label instructed them to perform an action that
 * cannot possibly work. A mislabelled `role="region"` is an accessibility
 * defect, not just a cosmetic one.
 *
 * Kept as a pure function rather than inlined in DistrictsPage so it can be
 * unit-tested without mounting the page (R22, and the Lesson 51 contention
 * cost of a full DistrictsPage mount).
 *
 * @param isScrollable Whether the region's content actually overflows
 *   horizontally. Note this must be derived from `scrollWidth > clientWidth`,
 *   NOT from the "more content to the right" flag that drives the fade cue —
 *   that one goes false once the user scrolls to the end, which would strip
 *   the affordance from the label mid-interaction.
 */
export function rankingsScrollLabel(isScrollable: boolean): string {
  return isScrollable
    ? 'District rankings — scroll horizontally to see all metrics'
    : 'District rankings'
}
