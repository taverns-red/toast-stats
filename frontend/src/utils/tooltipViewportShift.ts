/* Viewport-collision arithmetic for the shared tooltip panels (#1405).
 *
 * Both tooltip components (`Tooltip`, `InfoTooltip`) render a fixed-width
 * panel centred on their trigger. Centred means `centre − width/2`, which is
 * negative for a trigger near the left viewport edge and past `innerWidth`
 * for one near the right — the panel renders half off-screen and the words
 * at that end are unreadable.
 *
 * The geometry lives here as pure functions so the arithmetic is testable
 * without a layout engine; `useViewportClampedTooltip` supplies the measured
 * box and the CSS in `styles/components/tooltip.css` applies the result.
 */

/** Gap kept between a tooltip panel and the viewport edge, in px. */
export const TOOLTIP_VIEWPORT_MARGIN_PX = 8

/** Minimum gap between the arrow and the panel's rounded corner, in px. */
export const TOOLTIP_ARROW_EDGE_INSET_PX = 14

/** The horizontal extent of a box, in viewport coordinates. */
export interface HorizontalExtent {
  left: number
  right: number
}

/**
 * How far right (positive) or left (negative) a centred tooltip panel must
 * move so its whole box sits inside the viewport.
 *
 * @param extent - the panel's UNSHIFTED horizontal extent
 * @param viewportWidth - the visible width to fit inside
 * @param margin - gap to keep from each edge
 */
export function computeTooltipShift(
  extent: HorizontalExtent,
  viewportWidth: number,
  margin: number = TOOLTIP_VIEWPORT_MARGIN_PX
): number {
  // RED (#1405) — not implemented yet.
  void extent
  void viewportWidth
  void margin
  return 0
}

/**
 * The arrow's own horizontal offset. The panel moved by `shift`, so the arrow
 * moves back by the same amount to keep pointing at its trigger — clamped so
 * it can never detach from the panel it belongs to.
 */
export function computeArrowShift(shift: number, panelWidth: number): number {
  // RED (#1405) — not implemented yet.
  void shift
  void panelWidth
  return 0
}
