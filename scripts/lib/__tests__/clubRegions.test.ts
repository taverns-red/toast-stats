/**
 * Unit tests for scripts/lib/clubRegions.ts (#2084, ADR-016 follow-up).
 *
 * The street-level basemap merges the world z0–10 archive with a z11–14
 * extract over buffered club coordinates. `pmtiles extract --region` takes a
 * GeoJSON FeatureCollection of Polygon features (go-pmtiles 1.31.2,
 * pmtiles/region.go UnmarshalRegion), so that is what this lib emits.
 *
 * The analytics fixture is a TRIMMED CAPTURE of the live prod file
 * `snapshots/2026-10-14/analytics/district_61_analytics.json` (Lesson 154):
 * five clubs with `coordinates` and one without.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  extractClubPoints,
  bufferBox,
  clusterBoxes,
  shouldMerge,
  buildClubRegions,
  regionsToGeoJson,
  MAX_MERCATOR_LAT,
  type Box,
} from '../clubRegions'

const FIXTURE = join(
  __dirname,
  'fixtures',
  'club-regions',
  'district_61_analytics.trimmed.json'
)
const d61 = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as unknown

const KM_PER_DEG_LAT = 111.32

const inside = (p: { lat: number; lng: number }, b: Box): boolean =>
  p.lng >= b[0] && p.lat >= b[1] && p.lng <= b[2] && p.lat <= b[3]

describe('extractClubPoints', () => {
  it('reads data.allClubs[].coordinates from a live-shape analytics file', () => {
    const r = extractClubPoints(d61)
    expect(r.total).toBe(6)
    expect(r.points).toHaveLength(5)
    expect(r.points[0]).toEqual({
      clubId: '3045',
      lat: 44.25068,
      lng: -76.551,
    })
    expect(r.missing).toBe(1)
    expect(r.invalid).toBe(0)
  })

  it('rejects non-finite, out-of-range and null-island coordinates', () => {
    const file = {
      data: {
        allClubs: [
          { clubId: 'a', coordinates: { lat: 0, lng: 0 } },
          { clubId: 'b', coordinates: { lat: 91, lng: 10 } },
          { clubId: 'c', coordinates: { lat: 10, lng: -181 } },
          { clubId: 'd', coordinates: { lat: 'x', lng: 10 } },
          { clubId: 'e', coordinates: { lat: 10, lng: 20 } },
        ],
      },
    }
    const r = extractClubPoints(file)
    expect(r.points.map(p => p.clubId)).toEqual(['e'])
    expect(r.invalid).toBe(4)
    expect(r.total).toBe(5)
  })

  it('throws on a file with no allClubs array (a schema change must fail loudly)', () => {
    expect(() => extractClubPoints({ data: {} })).toThrow(/allClubs/)
    expect(() => extractClubPoints(null)).toThrow(/allClubs/)
  })
})

describe('bufferBox', () => {
  it('buffers by km in both axes, widening longitude by 1/cos(lat)', () => {
    const b = bufferBox({ lat: 60, lng: 10 }, 8)
    const dLat = 8 / KM_PER_DEG_LAT
    expect(b[1]).toBeCloseTo(60 - dLat, 6)
    expect(b[3]).toBeCloseTo(60 + dLat, 6)
    // cos(60°) = 0.5, so the longitude half-width doubles.
    expect(b[2] - 10).toBeCloseTo(2 * dLat, 6)
    expect(10 - b[0]).toBeCloseTo(2 * dLat, 6)
  })

  it('clamps latitude to the Web Mercator limit', () => {
    const b = bufferBox({ lat: 85, lng: 0 }, 50)
    expect(b[3]).toBe(MAX_MERCATOR_LAT)
  })

  it('keeps a box that crosses the antimeridian as minLon > maxLon', () => {
    // Fiji: 179.9°E plus 8 km crosses 180.
    const b = bufferBox({ lat: -17, lng: 179.98 }, 8)
    expect(b[0]).toBeGreaterThan(b[2])
    expect(b[0]).toBeLessThan(180)
    expect(b[2]).toBeGreaterThan(-180)
  })
})

describe('clusterBoxes', () => {
  it('merges overlapping boxes into their union and leaves disjoint ones alone', () => {
    const merged = clusterBoxes([
      [0, 0, 2, 2],
      [1, 1, 3, 3],
      [10, 10, 11, 11],
    ])
    expect(merged).toHaveLength(2)
    expect(merged).toContainEqual({ box: [0, 0, 3, 3], count: 2 })
    expect(merged).toContainEqual({ box: [10, 10, 11, 11], count: 1 })
  })

  it('keeps boxes that only touch at a corner apart: their union would mostly be empty', () => {
    // A corridor of clubs (Boston–Washington) chained into one bbox covered
    // 218k km² of mostly empty land and sea. Overlapping polygons are fine for
    // go-pmtiles: its relevance bitmap is the union of every polygon's tiles.
    const merged = clusterBoxes([
      [0, 0, 2, 2],
      [1.9, 1.9, 3.9, 3.9],
    ])
    expect(merged).toHaveLength(2)
  })

  it('re-merges when a union grows into a box it did not touch before', () => {
    // A and B merge; their union reaches C, which overlapped neither alone.
    const merged = clusterBoxes([
      [0, 0, 2, 1],
      [1.5, 0.2, 4, 1.2],
      [3, 0, 5, 0.15],
    ])
    expect(merged).toEqual([{ box: [0, 0, 5, 1.2], count: 3 }])
  })

  it('is stable: no two output regions still qualify for a merge', () => {
    const boxes: Box[] = []
    for (let i = 0; i < 60; i++) {
      const x = (i * 37) % 23
      const y = (i * 17) % 19
      boxes.push([x, y, x + 1.5, y + 1.5])
    }
    const merged = clusterBoxes(boxes)
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        expect(shouldMerge(merged[i]!.box, merged[j]!.box)).toBe(false)
      }
    }
    expect(merged.reduce((s, m) => s + m.count, 0)).toBe(60)
  })
})

describe('buildClubRegions', () => {
  it('puts every club inside a buffer and reports the coverage', () => {
    const r = buildClubRegions([d61], { bufferKm: 8 })
    expect(r.stats.clubsTotal).toBe(6)
    expect(r.stats.clubsWithCoordinates).toBe(5)
    expect(r.stats.clubsInsideBuffer).toBe(5)
    // Five Kingston clubs within ~8 km of each other → one cluster.
    expect(r.regions).toHaveLength(1)
    const pts = extractClubPoints(d61).points
    for (const p of pts)
      expect(r.regions.some(g => inside(p, g.box))).toBe(true)
  })

  it('counts a club listed by two districts once', () => {
    const r = buildClubRegions([d61, d61], { bufferKm: 8 })
    expect(r.stats.clubsTotal).toBe(6)
    expect(r.stats.clubsWithCoordinates).toBe(5)
  })

  it('rejects a buffer outside 1..50 km', () => {
    expect(() => buildClubRegions([d61], { bufferKm: 0 })).toThrow(/buffer/)
    expect(() => buildClubRegions([d61], { bufferKm: 51 })).toThrow(/buffer/)
  })
})

describe('regionsToGeoJson', () => {
  it('emits a FeatureCollection of closed Polygon rings that pmtiles --region accepts', () => {
    const fc = regionsToGeoJson([{ box: [1, 2, 3, 4], count: 2 }])
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]!
    expect(f.type).toBe('Feature')
    expect(f.geometry.type).toBe('Polygon')
    const ring = f.geometry.coordinates[0]!
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(ring).toContainEqual([1, 2])
    expect(ring).toContainEqual([3, 4])
    expect(f.properties).toEqual({ clubs: 2 })
  })

  it('splits an antimeridian box into two polygons, as go-pmtiles does for --bbox', () => {
    const fc = regionsToGeoJson([
      { box: [179.9, -17.1, -179.9, -16.9], count: 1 },
    ])
    expect(fc.features).toHaveLength(2)
    const xs = fc.features.flatMap(f =>
      f.geometry.coordinates[0]!.map(c => c[0]!)
    )
    expect(Math.max(...xs)).toBe(180)
    expect(Math.min(...xs)).toBe(-180)
  })
})
