/**
 * #1843 — the club page's static mini-map. A tiny inline SVG drawn from the
 * district snapshot's coordinates (no tiles, no MapLibre, no extra request)
 * that links to the district club map with this club selected.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { ClubMiniMap } from '../ClubMiniMap'

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
        {...props}
      />
    </MemoryRouter>
  )

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
    const svg = container.querySelector('svg.club-minimap__svg')!
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg.getAttribute('aria-label')).toMatch(
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

  it('never loads a map library or tiles: the SVG is inline', () => {
    const { container } = renderMap()
    expect(container.querySelector('img, canvas, iframe')).toBeNull()
  })
})
