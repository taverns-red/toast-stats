/**
 * The SVG country choropleth (#1797). A small hand-made geometry keeps the
 * test independent of the 87 KB asset; the asset itself is checked by
 * countryCodes.test.ts.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { WorldChoropleth } from '../WorldChoropleth'
import { buildChoroplethView } from '../countryChoroplethView'
import type { WorldGeometry } from '../worldGeometry'
import { CHOROPLETH_THEME } from '../choroplethScale'

const geometry: WorldGeometry = {
  source: 'test',
  width: 1000,
  height: 450,
  sphere: 'M0 0h1000v450h-1000z',
  countries: [
    {
      id: '840',
      name: 'United States of America',
      d: 'M10 10h300v150h-300z',
      b: [10, 10, 310, 160],
    },
    {
      id: '356',
      name: 'India',
      d: 'M650 150h40v60h-40z',
      b: [650, 150, 690, 210],
    },
    {
      id: '010',
      name: 'Nowhere',
      d: 'M500 300h20v20h-20z',
      b: [500, 300, 520, 320],
    },
  ],
  markers: [
    { id: '702', name: 'Singapore', x: 789, y: 245 },
    { id: '048', name: 'Bahrain', x: 620, y: 170 },
  ],
}

const view = buildChoroplethView(
  [
    { country: 'United States', clubs: 5662 },
    { country: 'India', clubs: 12 },
    { country: 'Singapore', clubs: 180 },
  ],
  342,
  6196,
  id =>
    geometry.countries.some(c => c.id === id)
      ? 'polygon'
      : geometry.markers.some(m => m.id === id)
        ? 'marker'
        : undefined
)

function renderMap(
  props: Partial<React.ComponentProps<typeof WorldChoropleth>> = {}
) {
  const onSelect = vi.fn()
  const utils = render(
    <WorldChoropleth
      geometry={geometry}
      view={view}
      theme="light"
      selectedId={null}
      onSelect={onSelect}
      {...props}
    />
  )
  return { ...utils, onSelect }
}

describe('WorldChoropleth', () => {
  it('is one labelled image that points to the table for the values', () => {
    renderMap()
    const img = screen.getByRole('img')
    expect(img).toHaveAccessibleName(/clubs by country/i)
    expect(img.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('fills each country with its bin colour, and hatches "no clubs"', () => {
    const { container } = renderMap()
    const us = container.querySelector('[data-iso="840"]')!
    const india = container.querySelector('[data-iso="356"]')!
    const none = container.querySelector('[data-iso="010"]')!
    expect(us.getAttribute('data-bin')).toBe('4')
    expect(us.getAttribute('fill')).toBe(CHOROPLETH_THEME.light.fills[4])
    expect(india.getAttribute('data-bin')).toBe('1')
    expect(none.getAttribute('data-bin')).toBe('none')
    expect(none.getAttribute('fill')).toMatch(/^url\(#/)
  })

  it('uses the dark ramp in dark mode', () => {
    const { container } = renderMap({ theme: 'dark' })
    expect(
      container.querySelector('[data-iso="840"]')!.getAttribute('fill')
    ).toBe(CHOROPLETH_THEME.dark.fills[4])
  })

  it('draws a dot only for small territories that have clubs', () => {
    const { container } = renderMap()
    expect(container.querySelector('circle[data-iso="702"]')).not.toBeNull()
    expect(container.querySelector('[data-iso="048"]')).toBeNull()
  })

  it('selects a country on click and shows its value in the readout', () => {
    const { onSelect, rerender } = renderMap()
    fireEvent.click(document.querySelector('[data-iso="356"]')!)
    expect(onSelect).toHaveBeenCalledWith('356')

    rerender(
      <WorldChoropleth
        geometry={geometry}
        view={view}
        theme="light"
        selectedId="356"
        onSelect={onSelect}
      />
    )
    const readout = screen.getByTestId('wm-readout')
    expect(readout).toHaveAttribute('aria-live', 'polite')
    expect(within(readout).getByText('India')).toBeInTheDocument()
    expect(readout).toHaveTextContent('12 clubs')
    expect(readout).toHaveTextContent('#3')
    expect(
      document.querySelector('[data-iso="356"]')!.getAttribute('class')
    ).toMatch(/selected/)
  })

  it('says "no clubs located" for a country without clubs', () => {
    renderMap({ selectedId: '010' })
    expect(screen.getByTestId('wm-readout')).toHaveTextContent(
      /Nowhere.*no clubs located/i
    )
  })

  it('shows a hovered country without selecting it', () => {
    const { onSelect } = renderMap()
    fireEvent.pointerEnter(document.querySelector('[data-iso="840"]')!)
    expect(screen.getByTestId('wm-readout')).toHaveTextContent('United States')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('zooms with buttons and resets to the whole world', () => {
    renderMap()
    const svg = screen.getByRole('img')
    const world = svg.getAttribute('viewBox')
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }))
    expect(svg.getAttribute('viewBox')).not.toBe(world)
    fireEvent.click(screen.getByRole('button', { name: /whole world/i }))
    expect(svg.getAttribute('viewBox')).toBe(world)
  })

  it('zooms to a small selected territory', () => {
    renderMap({ selectedId: '702' })
    const [, , w] = screen.getByRole('img').getAttribute('viewBox')!.split(' ')
    expect(Number(w)).toBeLessThan(geometry.width)
  })

  it('has a legend with every bin and the no-clubs state', () => {
    renderMap()
    const legend = screen.getByRole('list', { name: /legend/i })
    const items = within(legend).getAllByRole('listitem')
    expect(items.map(i => i.textContent)).toEqual([
      '1–4',
      '5–19',
      '20–99',
      '100–499',
      '500+',
      'No clubs located',
    ])
  })
})
