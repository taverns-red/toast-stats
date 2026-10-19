import { describe, expect, it } from 'vitest'
import { hasCoordinates, parseCoordinates } from '../geo/coordinates.js'

describe('parseCoordinates (#2153)', () => {
  it('keeps a real location', () => {
    expect(parseCoordinates({ lat: 21.30694, lng: -157.85833 })).toEqual({
      lat: 21.30694,
      lng: -157.85833,
    })
  })

  it('keeps a point on the equator or the prime meridian, just not both', () => {
    expect(parseCoordinates({ lat: 0, lng: 9.45 })).toEqual({
      lat: 0,
      lng: 9.45,
    })
    expect(parseCoordinates({ lat: 51.48, lng: 0 })).toEqual({
      lat: 51.48,
      lng: 0,
    })
  })

  it('treats the FAC ungeocoded sentinel (0, 0) as no coordinates', () => {
    expect(parseCoordinates({ lat: 0, lng: 0 })).toBeUndefined()
    expect(parseCoordinates({ lat: -0, lng: 0 })).toBeUndefined()
  })

  it('rejects non-finite, out-of-range and non-number values', () => {
    for (const bad of [
      { lat: NaN, lng: 1 },
      { lat: 1, lng: Infinity },
      { lat: 90.1, lng: 1 },
      { lat: 1, lng: -180.5 },
      { lat: '45.4', lng: '-75.7' },
      { lat: 45.4 },
      null,
      undefined,
      42,
    ]) {
      expect(parseCoordinates(bad), JSON.stringify(bad)).toBeUndefined()
      expect(hasCoordinates(bad)).toBe(false)
    }
  })

  it('returns a fresh pair without extra keys', () => {
    expect(parseCoordinates({ lat: 1, lng: 2, extra: true })).toEqual({
      lat: 1,
      lng: 2,
    })
  })
})
