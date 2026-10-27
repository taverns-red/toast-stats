import { describe, expect, it } from 'vitest'
import { cardUrlText, cropOffset, LAYOUTS } from '../layout'

// Mobile shows a 390×844 capture through a window ~523 CSS px tall, panned
// per beat so the highlighted element is in view and large enough to read.
const VIEWPORT_H = 844
const WINDOW_H = 520

describe('cropOffset', () => {
  it('centres a small highlight in the window', () => {
    const box = { x: 0, y: 500, width: 300, height: 100 }
    // centre 550 − half window 260 = 290
    expect(cropOffset(box, VIEWPORT_H, WINDOW_H)).toBe(290)
  })

  it('clamps at the top and the bottom of the viewport', () => {
    expect(
      cropOffset({ x: 0, y: 20, width: 10, height: 20 }, VIEWPORT_H, WINDOW_H)
    ).toBe(0)
    expect(
      cropOffset({ x: 0, y: 800, width: 10, height: 40 }, VIEWPORT_H, WINDOW_H)
    ).toBe(VIEWPORT_H - WINDOW_H)
  })

  it('shows the top of a highlight taller than the window', () => {
    const box = { x: 0, y: 200, width: 300, height: 600 }
    expect(cropOffset(box, VIEWPORT_H, WINDOW_H)).toBe(200 - 16)
  })

  it('keeps the top of the page when there is no highlight', () => {
    expect(cropOffset(null, VIEWPORT_H, WINDOW_H)).toBe(0)
  })

  it('never pans when the window shows the whole viewport', () => {
    const box = { x: 0, y: 500, width: 300, height: 100 }
    expect(cropOffset(box, 800, 800)).toBe(0)
  })
})

describe('LAYOUTS', () => {
  it('is 16:9 for desktop and 9:16 for mobile', () => {
    expect([LAYOUTS.desktop.width, LAYOUTS.desktop.height]).toEqual([
      1920, 1080,
    ])
    expect([LAYOUTS.mobile.width, LAYOUTS.mobile.height]).toEqual([1080, 1920])
  })

  it('keeps the panel and caption band inside the frame', () => {
    for (const l of Object.values(LAYOUTS)) {
      expect(l.panel.x).toBeGreaterThanOrEqual(0)
      expect(l.panel.x + l.panel.w).toBeLessThanOrEqual(l.width)
      expect(l.caption.y).toBeGreaterThanOrEqual(l.panel.y + l.panel.h)
      expect(l.caption.y + l.caption.h).toBeLessThanOrEqual(l.height)
    }
  })

  it('makes 16 px phone UI text at least 36 px tall in the 1080-wide frame', () => {
    // ≈13 pt when the 9:16 video fills a 390 pt-wide phone screen.
    expect(16 * LAYOUTS.mobile.scale).toBeGreaterThanOrEqual(36)
  })
})

describe('cardUrlText (#2353, PR #2356 review)', () => {
  it('lets a URL wrap after a slash or a "?", never at a hyphen', () => {
    const text = cardUrlText(
      'ts.taverns.red/district/86/clubs?preset=close-to-distinguished'
    )
    expect(text).toBe(
      'ts.taverns.red/​district/​86/​clubs?​preset=close‑to‑distinguished'
    )
  })

  it('leaves text without a URL alone', () => {
    expect(cardUrlText('Club officers:')).toBe('Club officers:')
  })
})
