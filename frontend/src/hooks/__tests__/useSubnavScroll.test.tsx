import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DistrictSubnav } from '../../components/DistrictSubnav'
import { ClubsSubnav } from '../../components/clubs/ClubsSubnav'
import { centeredScrollLeft } from '../useSubnavScroll'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * #1829 (epic #1827) — the section nav is a horizontal scroll-row; at 375px
 * 5 of 9 district routes left the ACTIVE link off-screen (`/action-list`:
 * link at 642–733 inside a 327px nav, scrollLeft 0). The nav must scroll the
 * active link into view on mount and on route change, horizontally only, and
 * expose which edges have more content so CSS can draw fade cues.
 *
 * jsdom has no layout, so the geometry of the real 375px measurement
 * (review interact §7) is stubbed onto the nav and its active link.
 */

const NAV_WIDTH = 327
const SCROLL_WIDTH = 733
// The active link's box relative to the nav's left edge at scrollLeft 0.
const ACTIVE_LEFT = 642
const ACTIVE_WIDTH = 91

let scrollLeft = 0
let reducedMotion = false
const scrollToSpy = vi.fn()
const windowScrollSpy = vi.fn()

const isNav = (el: Element) => el.classList.contains('district-subnav')

beforeEach(() => {
  scrollLeft = 0
  reducedMotion = false
  scrollToSpy.mockReset()
  windowScrollSpy.mockReset()

  vi.spyOn(window, 'scrollTo').mockImplementation(windowScrollSpy)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isNav(this) ? NAV_WIDTH : 0
    }
  )
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isNav(this) ? SCROLL_WIDTH : 0
    }
  )
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(function (
    this: Element
  ) {
    return isNav(this) ? scrollLeft : 0
  })
  Element.prototype.scrollTo = function (
    this: Element,
    opts?: { left?: number; behavior?: string } | number
  ) {
    scrollToSpy(this, opts)
    if (typeof opts === 'object' && typeof opts.left === 'number') {
      scrollLeft = opts.left
    }
  } as Element['scrollTo']
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const box = (left: number, width: number) =>
        ({
          left,
          right: left + width,
          width,
          top: 0,
          bottom: 44,
          height: 44,
          x: left,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
      if (isNav(this)) return box(0, NAV_WIDTH)
      if (this.getAttribute('aria-current') === 'page')
        return box(ACTIVE_LEFT - scrollLeft, ACTIVE_WIDTH)
      return box(0, 0)
    }
  )
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') && reducedMotion,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (Element.prototype as Partial<Element>).scrollTo
})

const renderDistrict = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DistrictSubnav districtId="61" />
    </MemoryRouter>
  )

describe('centeredScrollLeft (#1829)', () => {
  it('centres the link and clamps to the scrollable range', () => {
    // /action-list at 375: the ideal centre overshoots, so clamp to max.
    expect(
      centeredScrollLeft({
        navLeft: 0,
        navWidth: NAV_WIDTH,
        linkLeft: ACTIVE_LEFT,
        linkWidth: ACTIVE_WIDTH,
        scrollLeft: 0,
        scrollWidth: SCROLL_WIDTH,
      })
    ).toBe(SCROLL_WIDTH - NAV_WIDTH)
    // A mid-row link is centred exactly.
    expect(
      centeredScrollLeft({
        navLeft: 24,
        navWidth: 300,
        linkLeft: 424,
        linkWidth: 100,
        scrollLeft: 0,
        scrollWidth: 1000,
      })
    ).toBe(300)
    // The first link never produces a negative offset.
    expect(
      centeredScrollLeft({
        navLeft: 0,
        navWidth: 300,
        linkLeft: -120, // the first link, scrolled 120px out of view
        linkWidth: 80,
        scrollLeft: 120,
        scrollWidth: 1000,
      })
    ).toBe(0)
  })
})

describe('section nav keeps the active link in view (#1829)', () => {
  it('scrolls the nav (not the page) so the active link is fully visible on mount', () => {
    renderDistrict('/district/61/action-list')
    const nav = screen.getByTestId('district-subnav')
    expect(scrollToSpy).toHaveBeenCalledWith(
      nav,
      expect.objectContaining({ left: SCROLL_WIDTH - NAV_WIDTH })
    )
    // Bounding-box visibility inside the nav (Lesson 134), not toBeVisible.
    const active = screen.getByRole('link', { name: 'Action List' })
    const r = active.getBoundingClientRect()
    expect(r.left).toBeGreaterThanOrEqual(0)
    expect(r.right).toBeLessThanOrEqual(NAV_WIDTH)
    expect(windowScrollSpy).not.toHaveBeenCalled()
    // aria-current stays on the active NavLink.
    expect(active).toHaveAttribute('aria-current', 'page')
  })

  it('first positioning is instant; a later route change animates unless reduced motion', () => {
    renderDistrict('/district/61')
    expect(scrollToSpy.mock.calls[0][1]).toMatchObject({ behavior: 'auto' })
    scrollToSpy.mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'Action List' }))
    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ behavior: 'smooth' })
    )
  })

  it('never animates under prefers-reduced-motion', () => {
    reducedMotion = true
    renderDistrict('/district/61')
    scrollToSpy.mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'Action List' }))
    expect(scrollToSpy).toHaveBeenCalled()
    for (const [, opts] of scrollToSpy.mock.calls) {
      expect(opts).toMatchObject({ behavior: 'auto' })
    }
  })

  it('flags each edge that has more content so CSS can draw the fade cue', () => {
    renderDistrict('/district/61')
    const nav = screen.getByTestId('district-subnav')
    // At scrollLeft 0 with 733 > 327: more to the end only.
    act(() => {
      scrollLeft = 0
      fireEvent.scroll(nav)
    })
    expect(nav).not.toHaveAttribute('data-fade-start')
    expect(nav).toHaveAttribute('data-fade-end')
    act(() => {
      scrollLeft = 200
      fireEvent.scroll(nav)
    })
    expect(nav).toHaveAttribute('data-fade-start')
    expect(nav).toHaveAttribute('data-fade-end')
    act(() => {
      scrollLeft = SCROLL_WIDTH - NAV_WIDTH
      fireEvent.scroll(nav)
    })
    expect(nav).toHaveAttribute('data-fade-start')
    expect(nav).not.toHaveAttribute('data-fade-end')
  })

  it('applies the same behaviour to the clubs-world subnav', () => {
    render(
      <MemoryRouter initialEntries={['/clubs/race/smedley']}>
        <ClubsSubnav />
      </MemoryRouter>
    )
    expect(scrollToSpy).toHaveBeenCalledWith(
      screen.getByTestId('clubs-subnav'),
      expect.objectContaining({ left: expect.any(Number) })
    )
  })
})

describe('section nav fade-cue CSS contract (#1829)', () => {
  const css = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../styles/components/district-subnav.css'
    ),
    'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '')

  it('draws a theme-agnostic mask fade on each flagged edge', () => {
    for (const sel of [
      '.district-subnav[data-fade-end]',
      '.district-subnav[data-fade-start]',
      '.district-subnav[data-fade-start][data-fade-end]',
    ]) {
      const i = css.indexOf(`${sel} {`)
      expect(i, sel).toBeGreaterThan(-1)
      const rule = css.slice(i, css.indexOf('}', i))
      expect(rule).toMatch(/(^|\s)mask-image:\s*linear-gradient/)
      expect(rule).toMatch(/-webkit-mask-image:\s*linear-gradient/)
    }
  })

  it('pads the row 8px so the end links are not flush with the fade', () => {
    const i = css.indexOf('.district-subnav__list {')
    const rule = css.slice(i, css.indexOf('}', i))
    expect(rule).toMatch(/padding:\s*0 8px/)
  })
})
