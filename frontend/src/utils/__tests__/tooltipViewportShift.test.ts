import { describe, it, expect } from 'vitest'
import {
  computeArrowShift,
  computeTooltipShift,
  TOOLTIP_ARROW_EDGE_INSET_PX,
  TOOLTIP_VIEWPORT_MARGIN_PX,
} from '../tooltipViewportShift'

/* Viewport-collision arithmetic for the shared tooltip panels (#1405).
 *
 * The numbers below are the geometry MEASURED on production before the fix
 * (Chromium, `/district/61/analytics`, Education Levels card):
 *
 *   Level 1              left −67  right 253   (w-80 = 320px)
 *   Level 2 / Level 3    left −65  right 255
 *   Level 4+ · Path · DTM left −21  right 299
 *
 * and, on the landing page, the mirror problem on the right edge:
 *
 *   "Paid Clubs = …"     left 208  right 432   at innerWidth 375
 *                        left 601  right 825   at innerWidth 768
 *                        left 1183 right 1407  at innerWidth 1350
 *
 * These are pure functions precisely so the arithmetic can be pinned without
 * a layout engine — jsdom has none. The rendered pixels are proven by
 * `e2e/tooltip-viewport-clip.smoke.ts`.
 */

const M = TOOLTIP_VIEWPORT_MARGIN_PX

describe('computeTooltipShift', () => {
  it('leaves a panel that already fits where it is', () => {
    expect(computeTooltipShift({ left: 100, right: 420 }, 1350)).toBe(0)
  })

  it('does not nudge a panel that is exactly on the margin', () => {
    expect(computeTooltipShift({ left: M, right: 1350 - M }, 1350)).toBe(0)
  })

  it('pushes a left-clipped panel back inside (Education Levels, Level 1)', () => {
    const shift = computeTooltipShift({ left: -67, right: 253 }, 375)
    expect(shift).toBe(M + 67)
    expect(-67 + shift).toBe(M)
  })

  it('pulls a right-clipped panel back inside (landing, 375px)', () => {
    const shift = computeTooltipShift({ left: 208, right: 432 }, 375)
    expect(shift).toBe(-(432 - (375 - M)))
    expect(432 + shift).toBe(375 - M)
  })

  it('pulls a right-clipped panel back inside at 1350px too', () => {
    const shift = computeTooltipShift({ left: 1183, right: 1407 }, 1350)
    expect(1407 + shift).toBe(1350 - M)
    expect(1183 + shift).toBeGreaterThanOrEqual(M)
  })

  it.each([
    { label: 'Level 1', left: -67, right: 253 },
    { label: 'Level 2', left: -65, right: 255 },
    { label: 'Level 3', left: -65, right: 255 },
    { label: 'Level 4+ · Path · DTM', left: -21, right: 299 },
  ])(
    'lands the whole $label panel inside the viewport at every width',
    ({ left, right }) => {
      for (const viewportWidth of [375, 768, 1350]) {
        const shift = computeTooltipShift({ left, right }, viewportWidth)
        expect(left + shift).toBeGreaterThanOrEqual(0)
        expect(right + shift).toBeLessThanOrEqual(viewportWidth)
      }
    }
  )

  it('pins the left edge when the panel is wider than the viewport allows', () => {
    // 320px panel, 320px viewport: both edges cannot be satisfied. Keep the
    // opening words readable rather than the closing ones.
    const shift = computeTooltipShift({ left: -40, right: 280 }, 320)
    expect(-40 + shift).toBe(M)
  })

  it('honours a caller-supplied margin', () => {
    expect(computeTooltipShift({ left: -10, right: 310 }, 375, 20)).toBe(30)
  })
})

describe('computeArrowShift', () => {
  it('is zero when the panel did not move', () => {
    expect(computeArrowShift(0, 320)).toBe(0)
  })

  it('moves opposite to the panel so it keeps pointing at the trigger', () => {
    expect(computeArrowShift(75, 320)).toBe(-75)
    expect(computeArrowShift(-57, 320)).toBe(57)
  })

  it('never lets the arrow leave the panel it belongs to', () => {
    const room = 320 / 2 - TOOLTIP_ARROW_EDGE_INSET_PX
    expect(computeArrowShift(1000, 320)).toBe(-room)
    expect(computeArrowShift(-1000, 320)).toBe(room)
  })

  it('degrades to no offset for a panel too narrow to hold one', () => {
    expect(computeArrowShift(50, 20)).toBe(0)
  })
})
