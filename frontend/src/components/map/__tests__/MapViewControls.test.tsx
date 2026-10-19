/**
 * #2173 — the interactive club maps' control stack: zoom in, zoom out and
 * "Reset map view" (⌂). Reset restores the initial framing (the page passes
 * the pins' own refit) and closes any open club card. Real buttons, so they
 * are in the tab order with their names.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import MapViewControls from '../MapViewControls'

function fakeMap() {
  return { zoomIn: vi.fn(), zoomOut: vi.fn() }
}

describe('MapViewControls', () => {
  it('stacks zoom in, zoom out and reset as named, focusable buttons', () => {
    const map = fakeMap()
    render(
      <MapViewControls map={map as unknown as MapLibreMap} onReset={() => {}} />
    )
    const names = screen
      .getAllByRole('button')
      .map(b => b.getAttribute('aria-label'))
    expect(names).toEqual(['Zoom in', 'Zoom out', 'Reset map view'])
    for (const b of screen.getAllByRole('button')) {
      expect(b).toHaveAttribute('type', 'button')
      b.focus()
      expect(b).toHaveFocus()
    }
    expect(screen.getByRole('group', { name: 'Map view' })).toBeTruthy()
  })

  it('zooms the map', () => {
    const map = fakeMap()
    render(
      <MapViewControls map={map as unknown as MapLibreMap} onReset={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(map.zoomIn).toHaveBeenCalledTimes(1)
    expect(map.zoomOut).toHaveBeenCalledTimes(1)
  })

  it('resets the view through the caller', () => {
    const onReset = vi.fn()
    render(
      <MapViewControls
        map={fakeMap() as unknown as MapLibreMap}
        onReset={onReset}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset map view' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
