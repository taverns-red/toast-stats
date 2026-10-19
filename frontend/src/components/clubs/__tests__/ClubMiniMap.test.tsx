/**
 * #1843, #2162 — the club page's Location mini-map. An inline SVG of the
 * district's clubs (dots) and this club (a pin), drawn from coordinates the
 * page already has, linking to the district club map with this club
 * selected. Since #2162 real map tiles replace it once the card nears the
 * viewport and the hero has painted; the SVG is the placeholder until the
 * tiles are painted and the fallback when WebGL, the chunk or the tiles fail.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import D53 from '../../../utils/__tests__/fixtures/d53-club-coordinates-2026-10-18.json'
import { BASEMAP_ATTRIBUTION } from '../../map/basemapStyle'

const gate = vi.hoisted(() => ({ near: false, webgl: true, tilesRendered: 0 }))

vi.mock('../../../hooks/useNearViewport', () => ({
  useNearViewport: () => gate.near,
}))
vi.mock('../../../utils/webgl', () => ({
  supportsWebGL: () => gate.webgl,
}))
// The lazy tile chunk: a stand-in that reports painted or failed on demand.
vi.mock('../ClubMiniMapTiles', () => ({
  default: (props: { onPainted: () => void; onFailed: () => void }) => {
    gate.tilesRendered++
    return (
      <div data-testid="tiles">
        <button onClick={props.onPainted}>paint</button>
        <button onClick={props.onFailed}>fail</button>
      </div>
    )
  },
}))

import { ClubMiniMap } from '../ClubMiniMap'

beforeEach(() => {
  gate.near = false
  gate.webgl = true
  gate.tilesRendered = 0
})
afterEach(() => cleanup())

const CLUBS = [
  { clubId: '7238597', coordinates: { lat: 45.42197, lng: -75.69486 } },
  { clubId: '1001', coordinates: { lat: 45.3088, lng: -75.8987 } },
  { clubId: '1002', coordinates: { lat: 45.4805, lng: -75.5095 } },
  { clubId: '1003' },
]

const renderMap = (props: Partial<Parameters<typeof ClubMiniMap>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ClubMiniMap
        districtId="61"
        clubId="7238597"
        clubName="90 Elgin Toastmasters"
        clubs={CLUBS}
        place="90 Elgin Street, Ottawa, ON"
        heroPainted
        {...props}
      />
    </MemoryRouter>
  )

const frameOf = (c: HTMLElement) => c.querySelector('.club-minimap__frame')!

describe('ClubMiniMap', () => {
  it('links to the district club map with this club selected', () => {
    renderMap()
    const link = screen.getByRole('link', {
      name: /90 Elgin Toastmasters on the District 61 club map/,
    })
    expect(link).toHaveAttribute('href', '/district/61/map?club=7238597')
  })

  it('draws one dot per located club and one pin, described in text', () => {
    const { container } = renderMap()
    const frame = frameOf(container)
    expect(frame).toHaveAttribute('role', 'img')
    expect(frame.getAttribute('aria-label')).toMatch(
      /90 Elgin Toastmasters among 3 District 61 clubs with a location/
    )
    expect(container.querySelectorAll('.club-minimap__dot')).toHaveLength(2)
    expect(container.querySelectorAll('.club-minimap__pin')).toHaveLength(1)
  })

  it('shows where the club meets as text, never colour or position alone', () => {
    renderMap()
    expect(screen.getByText('90 Elgin Street, Ottawa, ON')).toBeInTheDocument()
  })

  it('renders nothing when the club has no coordinates', () => {
    const { container } = renderMap({ clubId: '1003' })
    expect(container).toBeEmptyDOMElement()
  })

  describe('tiles (#2162)', () => {
    it('loads nothing until the card nears the viewport', () => {
      const { container } = renderMap()
      expect(gate.tilesRendered).toBe(0)
      expect(container.querySelector('canvas')).toBeNull()
      expect(frameOf(container)).toHaveAttribute('data-tiles', 'none')
    })

    it('loads nothing before the hero has painted, even when near', () => {
      gate.near = true
      renderMap({ heroPainted: false })
      expect(gate.tilesRendered).toBe(0)
    })

    it('keeps the SVG when the browser has no WebGL2', () => {
      gate.near = true
      gate.webgl = false
      const { container } = renderMap()
      expect(gate.tilesRendered).toBe(0)
      expect(container.querySelectorAll('.club-minimap__pin')).toHaveLength(1)
    })

    it('loads the tiles when near and painted; the SVG stays until they paint', async () => {
      gate.near = true
      const { container } = renderMap()
      await screen.findByTestId('tiles')
      const frame = frameOf(container)
      expect(frame).toHaveAttribute('data-tiles', 'loading')
      expect(container.querySelector('.club-minimap__svg')).not.toBeNull()

      fireEvent.click(screen.getByText('paint'))
      expect(frame).toHaveAttribute('data-tiles', 'painted')
    })

    it('falls back to the SVG when the tiles fail', async () => {
      gate.near = true
      const { container } = renderMap()
      await screen.findByTestId('tiles')
      fireEvent.click(screen.getByText('fail'))
      expect(screen.queryByTestId('tiles')).toBeNull()
      expect(frameOf(container)).toHaveAttribute('data-tiles', 'failed')
      expect(container.querySelectorAll('.club-minimap__pin')).toHaveLength(1)
    })

    it('prints the ODbL credit outside the link, shown once the tiles paint', async () => {
      gate.near = true
      const { container } = renderMap()
      const credit = container.querySelector('.club-minimap__credit')!
      // Space reserved from the start (no shift), hidden until painted.
      expect(credit).toHaveAttribute('data-visible', 'false')
      expect(credit).toHaveAttribute('aria-hidden', 'true')
      await screen.findByTestId('tiles')
      fireEvent.click(screen.getByText('paint'))
      expect(credit).toHaveAttribute('data-visible', 'true')
      expect(credit).not.toHaveAttribute('aria-hidden')

      // Same links as the basemap's own attribution.
      const want = [...BASEMAP_ATTRIBUTION.matchAll(/href="([^"]+)"/g)].map(
        m => m[1]
      )
      const links = [...credit.querySelectorAll('a')]
      expect(links.map(a => a.getAttribute('href'))).toEqual(want)
      // Tab order: the card's link first, then the credit.
      const link = screen.getByRole('link', { name: /club map/ })
      expect(link.contains(credit)).toBe(false)
      expect(
        link.compareDocumentPosition(links[0]!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })
  })

  describe('far-off geocodes (#2162)', () => {
    it('leaves an outlying club off the view and says why', () => {
      const { container } = renderMap({
        districtId: '53',
        clubId: '28675595',
        clubName: 'Voya Toastmasters Club',
        clubs: D53,
      })
      expect(container.querySelectorAll('.club-minimap__pin')).toHaveLength(0)
      expect(
        container.querySelector('.club-minimap__legend')
      ).toHaveTextContent(/far from the rest of District 53/)
      expect(frameOf(container).getAttribute('aria-label')).toMatch(
        /outside this view/
      )
    })

    it('counts the other far-off locations it left out', () => {
      const { container } = renderMap({
        districtId: '53',
        clubId: '5520',
        clubName: 'Cedar Hill Toastmasters Club',
        clubs: D53,
      })
      expect(container.querySelectorAll('.club-minimap__pin')).toHaveLength(1)
      expect(container.querySelectorAll('.club-minimap__dot')).toHaveLength(
        D53.length - 3
      )
      expect(
        container.querySelector('.club-minimap__legend')
      ).toHaveTextContent(/2 far-off locations are left out/)
    })
  })
})

describe('ClubMiniMap — an online-only club (#2174)', () => {
  const ONLINE = [
    ...CLUBS.filter(c => c.clubId !== '7238597'),
    {
      clubId: '7238597',
      coordinates: { lat: 45.42197, lng: -75.69486 },
      meetsOnline: true as const,
    },
  ]

  it('says it meets online, with its day and time, instead of a map', () => {
    const { container } = renderMap({
      clubs: ONLINE,
      meetsOnline: true,
      when: 'Tuesday 7:00 pm',
    })
    expect(
      screen.getByText('Meets online · Tuesday 7:00 pm')
    ).toBeInTheDocument()
    expect(container.querySelector('.club-minimap__frame')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(gate.tilesRendered).toBe(0)
  })

  it('says only "Meets online" when no day or time is known', () => {
    renderMap({ clubs: ONLINE, meetsOnline: true, when: null })
    expect(screen.getByText('Meets online')).toBeInTheDocument()
  })

  it('leaves other online clubs off the map', () => {
    const others = [
      ...CLUBS,
      {
        clubId: '1004',
        coordinates: { lat: 45.35, lng: -75.75 },
        meetsOnline: true as const,
      },
    ]
    const { container } = renderMap({ clubs: others })
    const withOnline = container.querySelectorAll(
      '.club-minimap__svg circle'
    ).length
    cleanup()
    const { container: plain } = renderMap()
    expect(withOnline).toBe(
      plain.querySelectorAll('.club-minimap__svg circle').length
    )
  })
})
