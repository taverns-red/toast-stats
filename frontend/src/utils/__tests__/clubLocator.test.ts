/**
 * #1843 — the club page's static mini-map ("locator"): the district's clubs
 * as faint dots and this club as a pin, projected from the coordinates the
 * district snapshot already carries. No tiles, no MapLibre (review §6.3).
 */
import { describe, it, expect } from 'vitest'
import { projectClubLocator, projectClubPoints } from '../clubLocator'

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
