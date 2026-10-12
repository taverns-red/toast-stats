import { describe, it, expect } from 'vitest'
import { BASEMAP_OBJECT_PATH, resolveBasemapUrl } from '../basemap'

/* #1786 — where the basemap lives. The object sits on the same bucket/CDN as
 * the data, so a preview build (staging bucket base) and a prod build
 * (cdn.taverns.red) each read their own copy without extra configuration. */

describe('resolveBasemapUrl', () => {
  it('defaults to the versioned object on the data CDN', () => {
    expect(resolveBasemapUrl({}, 'https://cdn.taverns.red')).toBe(
      `https://cdn.taverns.red/${BASEMAP_OBJECT_PATH}`
    )
  })

  it('follows the staging CDN base on preview builds', () => {
    expect(
      resolveBasemapUrl(
        {},
        'https://storage.googleapis.com/toast-stats-data-staging/'
      )
    ).toBe(
      `https://storage.googleapis.com/toast-stats-data-staging/${BASEMAP_OBJECT_PATH}`
    )
  })

  it('lets VITE_BASEMAP_PMTILES_URL point dev at a local file', () => {
    expect(
      resolveBasemapUrl(
        { VITE_BASEMAP_PMTILES_URL: 'http://localhost:3000/dev.pmtiles' },
        'https://cdn.taverns.red'
      )
    ).toBe('http://localhost:3000/dev.pmtiles')
  })

  it('names an immutable, versioned object (never overwritten in place)', () => {
    expect(BASEMAP_OBJECT_PATH).toMatch(
      /^basemap\/protomaps-v4\/world-z0-10-\d{8}\.pmtiles$/
    )
  })
})
