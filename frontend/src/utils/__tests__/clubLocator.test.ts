/**
 * #1843 — the club page's static mini-map ("locator"): the district's clubs
 * as faint dots and this club as a pin, projected from the coordinates the
 * district snapshot already carries. No tiles, no MapLibre (review §6.3).
 */
import { describe, it, expect } from 'vitest'
import {
  fitClubLocator,
  projectClubLocator,
  projectClubPoints,
} from '../clubLocator'
import D53 from './fixtures/d53-club-coordinates-2026-10-18.json'

const BOX = { width: 320, height: 180, pad: 12 }

// Real D61 coordinates (snapshot 2026-10-11): 90 Elgin (Ottawa), a Kanata
// club west of it, an Orleans club east, a Cornwall club far south-east.
const CLUBS = [
  { clubId: '7238597', coordinates: { lat: 45.42197, lng: -75.69486 } },
  { clubId: '1001', coordinates: { lat: 45.3088, lng: -75.8987 } },
  { clubId: '1002', coordinates: { lat: 45.4805, lng: -75.5095 } },
  { clubId: '1003', coordinates: { lat: 45.0213, lng: -74.7303 } },
  { clubId: '1004' }, // no coordinates — skipped
]

describe('projectClubLocator', () => {
  it('projects every located club inside the padded box and marks the focus', () => {
    const out = projectClubLocator(CLUBS, '7238597', BOX)
    expect(out).not.toBeNull()
    expect(out!.points).toHaveLength(4)
    for (const p of out!.points) {
      expect(p.x).toBeGreaterThanOrEqual(BOX.pad - 0.001)
      expect(p.x).toBeLessThanOrEqual(BOX.width - BOX.pad + 0.001)
      expect(p.y).toBeGreaterThanOrEqual(BOX.pad - 0.001)
      expect(p.y).toBeLessThanOrEqual(BOX.height - BOX.pad + 0.001)
    }
    expect(out!.focus?.id).toBe('7238597')
  })

  it('skips a (0, 0) sentinel so it cannot stretch the box (#2153)', () => {
    const out = projectClubLocator(
      [...CLUBS, { clubId: '7787643', coordinates: { lat: 0, lng: 0 } }],
      '7238597',
      BOX
    )
    expect(out!.points).toHaveLength(4)
  })

  it('keeps north up and east right', () => {
    const out = projectClubLocator(CLUBS, '7238597', BOX)!
    const byId = new Map(out.points.map(p => [p.id, p]))
    // Cornwall is east of and south of Ottawa.
    expect(byId.get('1003')!.x).toBeGreaterThan(byId.get('7238597')!.x)
    expect(byId.get('1003')!.y).toBeGreaterThan(byId.get('7238597')!.y)
    // Kanata is west of Ottawa.
    expect(byId.get('1001')!.x).toBeLessThan(byId.get('7238597')!.x)
  })

  it('preserves the aspect ratio (one scale for both axes, cos-lat corrected)', () => {
    const out = projectClubLocator(CLUBS, '7238597', BOX)!
    const byId = new Map(out.points.map(p => [p.id, p]))
    const a = byId.get('1001')!
    const b = byId.get('1003')!
    const dxPx = Math.abs(b.x - a.x)
    const dyPx = Math.abs(b.y - a.y)
    const cos = Math.cos((45.2 * Math.PI) / 180)
    const dxDeg = Math.abs(-74.7303 - -75.8987) * cos
    const dyDeg = Math.abs(45.0213 - 45.3088)
    expect(dxPx / dyPx).toBeCloseTo(dxDeg / dyDeg, 0)
  })

  it('matches the focus club across zero-padded id forms', () => {
    const out = projectClubLocator(CLUBS, '07238597', BOX)
    expect(out?.focus?.id).toBe('7238597')
  })

  it('centres a single club instead of dividing by a zero range', () => {
    const out = projectClubLocator([CLUBS[0]!], '7238597', BOX)!
    expect(out.focus!.x).toBeCloseTo(BOX.width / 2)
    expect(out.focus!.y).toBeCloseTo(BOX.height / 2)
    expect(Number.isFinite(out.focus!.x)).toBe(true)
  })

  it('returns null when the focus club has no coordinates', () => {
    expect(projectClubLocator(CLUBS, '1004', BOX)).toBeNull()
    expect(projectClubLocator(CLUBS, '9999', BOX)).toBeNull()
  })

  it('ignores non-finite coordinates', () => {
    const out = projectClubLocator(
      [...CLUBS, { clubId: 'bad', coordinates: { lat: Number.NaN, lng: 0 } }],
      '7238597',
      BOX
    )!
    expect(out.points.map(p => p.id)).not.toContain('bad')
  })
})

// #1943 — the district map's static preview draws every located club with no
// focus, on the same projection as the club page's mini-map.
describe('projectClubPoints', () => {
  it('projects every located club into the padded box, with no focus', () => {
    const pts = projectClubPoints(CLUBS, BOX)
    expect(pts.map(p => p.id)).toEqual(['7238597', '1001', '1002', '1003'])
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(BOX.pad - 0.001)
      expect(p.x).toBeLessThanOrEqual(BOX.width - BOX.pad + 0.001)
      expect(p.y).toBeGreaterThanOrEqual(BOX.pad - 0.001)
      expect(p.y).toBeLessThanOrEqual(BOX.height - BOX.pad + 0.001)
    }
  })

  it('agrees with the locator projection point for point', () => {
    expect(projectClubPoints(CLUBS, BOX)).toEqual(
      projectClubLocator(CLUBS, '1001', BOX)!.points
    )
  })

  it('is empty when no club has coordinates', () => {
    expect(projectClubPoints([{ clubId: '1' }], BOX)).toEqual([])
  })
})

// #2162 — the tiled mini-map fits its view to the district's clubs with far-off
// geocodes trimmed. FAC sometimes places a club on another continent: in the
// 2026-10-18 D53 snapshot, Voya (28675595, address in CT) sits in Mumbai and
// Greater Hartford (919) in Wilmington, NC. The fixture is that snapshot's
// 147 located clubs, unedited.
describe('fitClubLocator', () => {
  const HARTFORD_AREA = '5520' // Cedar Hill, Hartford CT
  const VOYA = '28675595'
  const WILMINGTON = '919'

  it('trims the far-off geocodes and keeps every other club in view', () => {
    const fit = fitClubLocator(D53, HARTFORD_AREA)!
    const ids = fit.inView.map(c => c.clubId)
    expect(ids).not.toContain(VOYA)
    expect(ids).not.toContain(WILMINGTON)
    expect(fit.trimmed).toBe(2)
    expect(fit.inView).toHaveLength(D53.length - 2)
    expect(fit.focus?.clubId).toBe(HARTFORD_AREA)
    expect(fit.focusIsOutlier).toBe(false)
  })

  it('bounds the kept clubs only: the north-east, not India', () => {
    const [[west, south], [east, north]] = fitClubLocator(
      D53,
      HARTFORD_AREA
    )!.bounds
    expect(west).toBeGreaterThan(-80)
    expect(east).toBeLessThan(-71)
    expect(south).toBeGreaterThan(40)
    expect(north).toBeLessThan(46)
  })

  it('leaves an outlying focus club out of the view and says so', () => {
    const fit = fitClubLocator(D53, VOYA)!
    expect(fit.focus).toBeNull()
    expect(fit.focusIsOutlier).toBe(true)
    expect(fit.inView.map(c => c.clubId)).not.toContain(VOYA)
    expect(fit.bounds[1][0]).toBeLessThan(-71)
  })

  it('trims nothing in a compact district', () => {
    const fit = fitClubLocator(CLUBS, '7238597')!
    expect(fit.trimmed).toBe(0)
    expect(fit.inView).toHaveLength(4)
    expect(fit.bounds).toEqual([
      [-75.8987, 45.0213],
      [-74.7303, 45.4805],
    ])
  })

  it('never trims a handful of clubs, however spread out', () => {
    const fit = fitClubLocator(
      [
        { clubId: 'a', coordinates: { lat: 41.7, lng: -72.7 } },
        { clubId: 'b', coordinates: { lat: 41.8, lng: -72.6 } },
        { clubId: 'c', coordinates: { lat: 19.19, lng: 72.95 } },
      ],
      'a'
    )!
    expect(fit.trimmed).toBe(0)
  })

  it('gives a single club a zero-span box on its own point', () => {
    const fit = fitClubLocator([CLUBS[0]!], '7238597')!
    expect(fit.bounds).toEqual([
      [-75.69486, 45.42197],
      [-75.69486, 45.42197],
    ])
  })

  it('is null when the focus club has no coordinates', () => {
    expect(fitClubLocator(CLUBS, '1004')).toBeNull()
  })
})
