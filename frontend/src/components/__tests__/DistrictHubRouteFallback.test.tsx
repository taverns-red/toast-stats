/**
 * The `/district/:id` route fallback paints the hub's tile skeleton on phones
 * (#1901, mobile epic #1827).
 *
 * The hub's LCP element is a static caption in its loading skeleton
 * ("payments vs. program-year base"). It used to paint only once the lazy
 * route chunk had loaded and React had revealed it. React holds a Suspense
 * reveal for up to 300 ms after the fallback commits, unless another update
 * flushes it first. On a fast load that update was the CDN date index
 * arriving, so the hub's first paint, and LCP, were chained behind the CDN
 * connection plus `dates.json`.
 *
 * The fallback now renders the same tiles, so the caption paints with the app
 * shell. It must stay pixel-identical to the loading hub; otherwise the tiles
 * would jump when the page mounts. The markup test below pins that.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import '@testing-library/jest-dom'
import { DistrictHubRouteFallback } from '../DistrictHubRouteFallback'
import { DistrictOverviewHub } from '../DistrictOverviewHub'
import { DISTRICT_HUB_QUERY } from '../../utils/districtHub'
import { PHONE_SECTION_BAR_QUERY } from '../../config/districtSections'

const originalMatchMedia = window.matchMedia

/** `hub`: the hub layout query; `portraitPhone`: the phone section-bar query
 *  (upright phones). Short landscape phones match the first only. */
function mockLayout({
  hub,
  portraitPhone,
}: {
  hub: boolean
  portraitPhone: boolean
}) {
  const answers: Record<string, boolean> = {
    [DISTRICT_HUB_QUERY]: hub,
    [PHONE_SECTION_BAR_QUERY]: portraitPhone,
  }
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: answers[query] ?? false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => mockLayout({ hub: true, portraitPhone: true }))
afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
})

const generic = <div data-testid="generic-fallback" />

describe('DistrictHubRouteFallback (#1901)', () => {
  it('paints the hub tiles, LCP caption included, on phones', () => {
    render(<DistrictHubRouteFallback fallback={generic} />)

    expect(screen.getAllByTestId('district-hub-tile')).toHaveLength(4)
    expect(
      screen.getByText('payments vs. program-year base')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('generic-fallback')).not.toBeInTheDocument()
  })

  it('holds the context bar slot above the tiles, as the page does', () => {
    const { container } = render(
      <DistrictHubRouteFallback fallback={generic} />
    )
    const page = container.querySelector('.district-detail-page')
    expect(page).not.toBeNull()
    const [bar, hub] = Array.from(page!.children)
    expect(bar).toHaveClass('context-bar')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(hub).toHaveClass('district-hub', 'district-hub--loading')
    expect(hub).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps the generic fallback on tablets and desktops', () => {
    mockLayout({ hub: false, portraitPhone: false })
    render(<DistrictHubRouteFallback fallback={generic} />)

    expect(screen.getByTestId('generic-fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('district-hub-tile')).not.toBeInTheDocument()
  })

  it('keeps the generic fallback on short landscape phones', () => {
    // The hub layout applies there too, but the page puts the 45 px section
    // row above the hub instead of the bottom bar, so fallback tiles would
    // sit 61 px too high and jump when the page mounted (measured 812×375).
    mockLayout({ hub: true, portraitPhone: false })
    render(<DistrictHubRouteFallback fallback={generic} />)

    expect(screen.getByTestId('generic-fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('district-hub-tile')).not.toBeInTheDocument()
  })

  it('renders tiles identical to the loading hub, so nothing jumps on mount', () => {
    const fallback = render(<DistrictHubRouteFallback fallback={generic} />)
    const fallbackTiles = fallback.container.querySelector(
      '.district-hub__tiles'
    )?.outerHTML
    cleanup()

    const hub = render(
      <MemoryRouter>
        <DistrictOverviewHub
          districtId="61"
          programYear="2026-2027"
          snapshotDate={undefined}
          kpis={null}
          clubs={null}
          interventionClubs={null}
        />
      </MemoryRouter>
    )
    const hubTiles = hub.container.querySelector(
      '.district-hub__tiles'
    )?.outerHTML

    expect(fallbackTiles).toBeDefined()
    expect(fallbackTiles).toBe(hubTiles)
  })
})

describe('App wiring (#1901)', () => {
  it('uses the hub fallback for the /district/:id overview route', () => {
    const app = readFileSync(join(__dirname, '../../App.tsx'), 'utf-8')
    const route = app.match(
      /path: 'district\/:districtId',\s*element: \(([\s\S]*?)\),\s*}/
    )?.[1]
    expect(route).toMatch(
      /<Suspense\s+fallback=\{\s*<DistrictHubRouteFallback[\s\S]*?\/>\s*\}\s*>\s*<DistrictDetailPage \/>/
    )
  })
})
