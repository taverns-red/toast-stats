import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/* #1943 — the map route starts reading the archive head as soon as it
 * renders, while the MapLibre chunk is still downloading. */

const prefetch = vi.hoisted(() => vi.fn(async () => null))
vi.mock('../basemapPrefetch', () => ({ prefetchBasemapHead: prefetch }))
vi.mock('../BasemapMap', () => ({ default: () => null }))

import LazyBasemapMap from '../LazyBasemapMap'

describe('LazyBasemapMap', () => {
  beforeEach(() => prefetch.mockClear())

  it('starts the head prefetch for the given archive before MapLibre loads', () => {
    render(
      <LazyBasemapMap ariaLabel="Map" pmtilesUrl="https://x.test/a.pmtiles" />
    )
    expect(prefetch).toHaveBeenCalledWith('https://x.test/a.pmtiles')
  })

  it('defaults to the configured basemap archive', () => {
    render(<LazyBasemapMap ariaLabel="Map" />)
    expect(prefetch.mock.calls[0]![0]).toMatch(
      /basemap\/protomaps-v4\/world-z0-10-\d{8}\.pmtiles$/
    )
  })
})
