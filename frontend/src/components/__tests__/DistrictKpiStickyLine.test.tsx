import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { DistrictKpiStickyLine } from '../DistrictKpiStickyLine'
import type { DistrictKpiStripData } from '../DistrictKpiStrip'

/* #2708 (D4): once the KPI block has scrolled away, a single opaque line of
   the four headline figures pins under the top bar. This covers the markup
   and the stuck/unstuck switch; the geometry (height, opacity, z-index) is in
   styles/__tests__/districtKpiStickyLine.test.ts and the e2e smoke. */

const targets = { distinguished: 1, select: 2, presidents: 3, smedley: 4 }
const rankings = {
  worldRank: 1,
  worldPercentile: 1,
  regionRank: 1,
  totalDistricts: 1,
  totalInRegion: 1,
  region: '08',
}
const kpis: DistrictKpiStripData = {
  paidClubs: { current: 888, targets, rankings },
  membershipPayments: { current: 8888, targets, rankings },
  distinguishedClubs: {
    current: 120,
    targets,
    rankings,
    provisional: 12,
  },
  netMemberChange: { current: -1200 },
}

type IoCallback = (entries: Partial<IntersectionObserverEntry>[]) => void
let ioCallback: IoCallback | null = null
type IoOptions = { rootMargin?: string }
let ioOptions: IoOptions | undefined

beforeEach(() => {
  ioCallback = null
  ioOptions = undefined
  class FakeIO {
    constructor(cb: IoCallback, options?: IoOptions) {
      ioCallback = cb
      ioOptions = options
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const line = () => screen.getByTestId('district-kpi-stuck-line')
const wrapper = () => screen.getByTestId('district-kpi-stuck')

describe('DistrictKpiStickyLine (#2708)', () => {
  it('renders nothing while the KPIs are loading', () => {
    const { container } = render(<DistrictKpiStickyLine kpis={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the four headline figures in whole words', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    const items = line().querySelectorAll('.district-kpi-stuck__item')
    expect(items).toHaveLength(4)
    const text = line().textContent ?? ''
    expect(text).toContain('Paid clubs')
    expect(text).toContain('Payments')
    expect(text).toContain('Distinguished')
    expect(text).toContain('888')
    expect(text).toContain('8.9K')
    expect(text).toContain('120')
    expect(text).not.toMatch(/\bPmts\b|\bDist\b/)
  })

  it('writes the provisional extra as the strip does, never a bare +N (#2554, D5)', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    const dist = line().querySelectorAll('.district-kpi-stuck__item')[2]
    expect(dist?.textContent).toContain('120')
    expect(dist?.textContent).toContain('+12 qualifying today')
  })

  it('says qualifying today when the Distinguished count is not confirmed (#2580, D5)', () => {
    render(
      <DistrictKpiStickyLine
        kpis={{
          ...kpis,
          distinguishedClubs: {
            ...kpis.distinguishedClubs,
            provisional: undefined,
            basis: 'qualifying-today',
          },
        }}
      />
    )
    const dist = line().querySelectorAll('.district-kpi-stuck__item')[2]
    expect(dist?.textContent).toContain('qualifying today')
    expect(dist?.textContent).not.toMatch(/provisional/)
  })

  it('shows no extra when nothing is provisional', () => {
    render(
      <DistrictKpiStickyLine
        kpis={{
          ...kpis,
          distinguishedClubs: { ...kpis.distinguishedClubs, provisional: 0 },
        }}
      />
    )
    const dist = line().querySelectorAll('.district-kpi-stuck__item')[2]
    expect(dist?.textContent).not.toMatch(/\+\d|provisional|qualifying/)
  })

  it('names the basis of Net: payments against the program-year base (D9)', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    const net = line().querySelectorAll('.district-kpi-stuck__item')[3]
    expect(net?.textContent).toContain('−1.2K')
    expect(net?.textContent).toContain('payments vs. program-year base')
  })

  it('marks Payments as the item dropped whole at narrow widths', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    const pay = line().querySelectorAll('.district-kpi-stuck__item')[1]
    expect(pay).toHaveClass('district-kpi-stuck__item--optional')
  })

  it('is hidden from assistive tech: the same figures sit in the strip above', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    expect(line()).toHaveAttribute('aria-hidden', 'true')
  })

  it('starts unstuck', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    expect(wrapper()).toHaveAttribute('data-stuck', 'false')
  })

  it('sticks once the sentinel has scrolled above the pin line, and releases on scroll back', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    expect(ioCallback).not.toBeNull()
    act(() =>
      ioCallback?.([
        { isIntersecting: false, boundingClientRect: { top: -20 } as DOMRect },
      ])
    )
    expect(wrapper()).toHaveAttribute('data-stuck', 'true')
    act(() =>
      ioCallback?.([
        { isIntersecting: true, boundingClientRect: { top: 200 } as DOMRect },
      ])
    )
    expect(wrapper()).toHaveAttribute('data-stuck', 'false')
  })

  it('does not stick when the sentinel is below the viewport', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    act(() =>
      ioCallback?.([
        { isIntersecting: false, boundingClientRect: { top: 5000 } as DOMRect },
      ])
    )
    expect(wrapper()).toHaveAttribute('data-stuck', 'false')
  })

  it('observes against the top-bar pin line', () => {
    render(<DistrictKpiStickyLine kpis={kpis} />)
    expect(ioOptions?.rootMargin).toBe('-56px 0px 0px 0px')
  })
})
