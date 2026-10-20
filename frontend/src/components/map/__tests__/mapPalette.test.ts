/**
 * Map pin palette validator (#1784), ported from the #1785 spec's
 * `palette_check.py` (PR #1895) so a palette edit fails CI instead of drifting
 * (docs/design/map-pin-colour-modes.md §6).
 *
 * - CVD: Machado, Oliveira & Fernandes (2009), severity 1.0, linear sRGB.
 * - Distinctness: CIEDE2000. Status/categorical palettes: every pair ≥ 15
 *   (normal) and ≥ 8 (each CVD). Ordinal: adjacent steps ≥ 8 under every
 *   vision, with monotone L* (Smedley exempt: a distinct award, not a step).
 * - Contrast: pin outline vs land and water ≥ 3:1 in both themes (1.4.11);
 *   the better of white or ink text on every fill ≥ 4.5:1 (1.4.3), and the
 *   renderer must pick that same colour.
 *
 * The palettes and outline are read from the modules the map renders with,
 * so this test guards the shipped values, not a copy.
 */
import { describe, expect, it } from 'vitest'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import {
  CATEGORICAL8,
  CATEGORICAL12,
  HEALTH_FILLS,
  OUTLINE,
  TIER_FILLS,
  labelColourOn,
} from '../pinModes'
import { BASEMAP_COLOURS } from '../basemapStyle'
import { DIVERGING5, SEQUENTIAL5, STATUS_FILLS } from '../pinExtended'
import { COACH_FILLS, COMPLIANCE_FILLS } from '../pinReports'
import { ATTENDANCE_FILLS, DAY_FILLS } from '../pinMeeting'
import { territoryModel } from '../pinTerritory'

type Vision = 'normal' | 'protan' | 'deutan' | 'tritan'
const VISIONS: Vision[] = ['normal', 'protan', 'deutan', 'tritan']
const INK = '#0F0E0D'
const WHITE = '#FFFFFF'

const MACHADO: Record<Exclude<Vision, 'normal'>, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

const hex2rgb = (h: string): number[] => {
  const s = h.replace('#', '')
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255)
}
const toLin = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
const toSrgb = (v: number) => {
  const c = Math.max(0, Math.min(1, v))
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}
const rgb2hex = (c: number[]) =>
  '#' +
  c
    .map(v =>
      Math.round(Math.max(0, Math.min(1, v)) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
    .toUpperCase()

function simulate(hex: string, v: Vision): string {
  if (v === 'normal') return hex
  const lin = hex2rgb(hex).map(toLin)
  const m = MACHADO[v]
  return rgb2hex(
    m.map(row => toSrgb(row.reduce((s, k, i) => s + k * lin[i]!, 0)))
  )
}

const luminance = (hex: string) => {
  const [r, g, b] = hex2rgb(hex).map(toLin) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (hi + 0.05) / (lo + 0.05)
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = hex2rgb(hex).map(toLin) as [number, number, number]
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

function ciede2000(c1: string, c2: string): number {
  const [L1, a1, b1] = lab(c1)
  const [L2, a2, b2] = lab(c2)
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cb = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = (deg(Math.atan2(b1, a1p)) + 360) % 360
  const h2p = (deg(Math.atan2(b2, a2p)) + 360) % 360
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p
    else if (h2p - h1p > 180) dhp = h2p - h1p - 360
    else dhp = h2p - h1p + 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2))
  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2
  let hbp: number
  if (C1p * C2p === 0) hbp = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2
  else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2
  else hbp = (h1p + h2p - 360) / 2
  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63))
  const dth = 30 * Math.exp(-(((hbp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2)
  const Sc = 1 + 0.045 * Cbp
  const Sh = 1 + 0.015 * Cbp * T
  const Rt = -Math.sin(rad(2 * dth)) * Rc
  return Math.sqrt(
    (dLp / Sl) ** 2 +
      (dCp / Sc) ** 2 +
      (dHp / Sh) ** 2 +
      Rt * (dCp / Sc) * (dHp / Sh)
  )
}

function minPairDelta(
  colours: string[],
  v: Vision,
  adjacentOnly: boolean
): number {
  let min = Infinity
  for (let i = 0; i < colours.length; i++)
    for (let j = i + 1; j < colours.length; j++) {
      if (adjacentOnly && j !== i + 1) continue
      min = Math.min(
        min,
        ciede2000(simulate(colours[i]!, v), simulate(colours[j]!, v))
      )
    }
  return min
}

describe('validator self-check (matches the spec §6.2 numbers)', () => {
  it('reproduces the health palette ΔE and the outline contrast', () => {
    const health = Object.values(HEALTH_FILLS)
    expect(minPairDelta(health, 'normal', false)).toBeCloseTo(38.0, 0)
    expect(contrast('#3D3B38', '#F4F1EB')).toBeCloseTo(9.9, 1)
  })
})

describe('status and categorical palettes', () => {
  const sets: Record<string, string[]> = {
    health: Object.values(HEALTH_FILLS),
    categorical8: [...CATEGORICAL8],
    // Territory modes (#2178): one hue per division or district, up to 12.
    categorical12: [...CATEGORICAL12],
    status: Object.values(STATUS_FILLS),
    // #1787: renewals, CSP and officer list; coach; how members attend.
    compliance: Object.values(COMPLIANCE_FILLS),
    coach: Object.values(COACH_FILLS),
    // How members attend, with "Online only" and "Not stated" (#1787).
    attendance: Object.values(ATTENDANCE_FILLS),
    // Meeting day: seven weekdays, several days, not stated (#1787).
    day: Object.values(DAY_FILLS),
  }
  for (const [name, colours] of Object.entries(sets)) {
    for (const v of VISIONS) {
      it(`${name}: every pair is distinct under ${v}`, () => {
        const limit = v === 'normal' ? 15 : 8
        expect(minPairDelta(colours, v, false)).toBeGreaterThanOrEqual(limit)
      })
    }
  }
})

describe('tier (ordinal) palette', () => {
  // Not yet → Distinguished → Select → President's → Smedley.
  const ramp = [
    TIER_FILLS.NotDistinguished,
    TIER_FILLS.Distinguished,
    TIER_FILLS.Select,
    TIER_FILLS.President,
    TIER_FILLS.Smedley,
  ]
  for (const v of VISIONS) {
    it(`adjacent steps ≥ 8 and L* monotone under ${v}`, () => {
      expect(minPairDelta(ramp, v, true)).toBeGreaterThanOrEqual(8)
      const ls = ramp.slice(0, 4).map(c => lab(simulate(c, v))[0])
      for (let i = 1; i < ls.length; i++)
        expect(ls[i]!).toBeLessThan(ls[i - 1]!)
    })
  }
})

// #1787: members, DCP goals and club age share one sequential ramp; net
// growth a diverging one, darkest at both ends and peaking at "no change".
describe('sequential and diverging palettes (#1787)', () => {
  for (const v of VISIONS) {
    it(`sequential5: adjacent steps ≥ 8 and L* monotone under ${v}`, () => {
      expect(minPairDelta([...SEQUENTIAL5], v, true)).toBeGreaterThanOrEqual(8)
      const ls = SEQUENTIAL5.map(c => lab(simulate(c, v))[0])
      for (let i = 1; i < ls.length; i++)
        expect(ls[i]!).toBeLessThan(ls[i - 1]!)
    })
    it(`diverging5: adjacent steps ≥ 8 and L* peaks at the centre under ${v}`, () => {
      expect(minPairDelta([...DIVERGING5], v, true)).toBeGreaterThanOrEqual(8)
      const ls = DIVERGING5.map(c => lab(simulate(c, v))[0])
      expect(ls[0]!).toBeLessThan(ls[1]!)
      expect(ls[1]!).toBeLessThan(ls[2]!)
      expect(ls[3]!).toBeLessThan(ls[2]!)
      expect(ls[4]!).toBeLessThan(ls[3]!)
    })
  }
})

describe('contrast', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`outline clears 3:1 on land and water (${theme})`, () => {
      const { land, water } = BASEMAP_COLOURS[theme]
      expect(contrast(OUTLINE[theme], land)).toBeGreaterThanOrEqual(3)
      expect(contrast(OUTLINE[theme], water)).toBeGreaterThanOrEqual(3)
    })
  }

  it('the renderer picks the better of white and ink, and it clears 4.5:1', () => {
    const fills = [
      ...Object.values(HEALTH_FILLS),
      ...Object.values(TIER_FILLS),
      ...CATEGORICAL12,
      ...Object.values(STATUS_FILLS),
      ...SEQUENTIAL5,
      ...DIVERGING5,
      ...Object.values(COMPLIANCE_FILLS),
      ...Object.values(COACH_FILLS),
      ...Object.values(ATTENDANCE_FILLS),
      ...Object.values(DAY_FILLS),
    ]
    for (const fill of fills) {
      const best = contrast(fill, WHITE) >= contrast(fill, INK) ? WHITE : INK
      expect(labelColourOn(fill)).toBe(best)
      expect(contrast(fill, best)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

/**
 * A synthetic district laid out like a real one (#2178): divisions are
 * blobs on a ring, each split into 1–7 area blobs of three clubs.
 */
function district(
  divisions: number,
  areasIn: (d: number) => number = d => 1 + ((d * 5) % 7)
): ClubTrend[] {
  const clubs: ClubTrend[] = []
  for (let d = 0; d < divisions; d++) {
    const div = String.fromCharCode(65 + d)
    const angle = (2 * Math.PI * d) / divisions
    const [lat, lng] = [45 + Math.sin(angle), -75 + Math.cos(angle)]
    const areas = areasIn(d)
    for (let a = 0; a < areas; a++)
      for (let k = 0; k < 3; k++)
        clubs.push({
          clubId: `${div}${a}${k}`,
          clubName: 'Club',
          divisionId: div,
          divisionName: `Division ${div}`,
          areaId: String(a + 1).padStart(2, '0'),
          areaName: `Area ${a + 1}`,
          membershipTrend: [],
          dcpGoalsTrend: [],
          currentStatus: 'thriving',
          riskFactors: [],
          distinguishedLevel: 'NotDistinguished',
          coordinates: {
            lat: lat + 0.1 * Math.sin(a) + 0.01 * k,
            lng: lng + 0.1 * Math.cos(a),
          },
        } as unknown as ClubTrend)
  }
  return clubs
}

const named = (m: ReturnType<typeof territoryModel>) =>
  m.categories.filter(c => c.shape !== 'suspended')

describe('territory colours (#2178)', () => {
  // Districts have about 4–12 divisions; any two must read apart.
  for (let n = 4; n <= 12; n++) {
    it(`${n} divisions: each its own hue, every pair distinct`, () => {
      const fills = named(territoryModel('division', district(n))).map(
        c => c.fill
      )
      expect(new Set(fills).size).toBe(n)
      for (const v of VISIONS)
        expect(minPairDelta(fills, v, false)).toBeGreaterThanOrEqual(
          v === 'normal' ? 15 : 8
        )
    })
  }

  describe('areas take their division hue in lightness steps', () => {
    const clubs = district(12)
    const divisions = new Map(
      named(territoryModel('division', clubs)).map(c => [c.code!, c.fill])
    )
    const areas = named(territoryModel('area', clubs))
    const byDivision = new Map<string, string[]>()
    for (const a of areas) {
      const d = a.code!.slice(0, 1)
      byDivision.set(d, [...(byDivision.get(d) ?? []), a.fill])
    }
    const hue = (hex: string) => {
      const [, a, b] = lab(hex)
      return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
    }

    it('keeps the division hue', () => {
      for (const [d, fills] of byDivision) {
        const h = hue(divisions.get(d)!)
        for (const f of fills) {
          const diff = Math.abs(hue(f) - h)
          expect(Math.min(diff, 360 - diff)).toBeLessThanOrEqual(12)
        }
      }
    })

    for (const v of VISIONS)
      it(`adjacent steps in a division are distinct under ${v}`, () => {
        for (const fills of byDivision.values()) {
          if (fills.length < 2) continue
          expect(minPairDelta(fills, v, true)).toBeGreaterThanOrEqual(5)
          expect(new Set(fills).size).toBe(fills.length)
        }
      })

    it('every shade carries a 4.5:1 code label', () => {
      for (const { fill } of areas) {
        const best = contrast(fill, WHITE) >= contrast(fill, INK) ? WHITE : INK
        expect(labelColourOn(fill)).toBe(best)
        expect(contrast(fill, best)).toBeGreaterThanOrEqual(4.5)
      }
    })
  })

  /**
   * Every area in a district must read apart from every other (#2178), not
   * just from its neighbouring shade: a live check on 2.63.0 found D61's
   * I91 and D30 at ΔE 4.5, olive and sand shades on the same rung. Area
   * counts per division are the real ones from the 2026-10-18 snapshot.
   */
  describe('every pair of areas in a district reads apart', () => {
    const layouts: Record<string, { counts: number[]; min: number }> = {
      'D61 (8 divisions, 34 areas)': {
        counts: [4, 5, 5, 4, 4, 4, 4, 4],
        min: 10,
      },
      'D53 (8 divisions, 34 areas)': {
        counts: [4, 4, 4, 4, 4, 4, 5, 5],
        min: 10,
      },
      'D94 (9 divisions, 45 areas)': {
        counts: [6, 6, 6, 4, 4, 5, 5, 5, 4],
        min: 10,
      },
      // The largest district on 2026-10-18.
      'D70 (8 divisions, 51 areas)': {
        counts: [7, 5, 7, 5, 7, 7, 7, 6],
        min: 9.5,
      },
    }
    for (const [name, { counts, min }] of Object.entries(layouts))
      it(`${name}: lowest pairwise ΔE2000 ≥ ${min}`, () => {
        const clubs = district(counts.length, d => counts[d]!)
        const fills = named(territoryModel('area', clubs)).map(c => c.fill)
        expect(fills).toHaveLength(counts.reduce((s, n) => s + n, 0))
        expect(minPairDelta(fills, 'normal', false)).toBeGreaterThanOrEqual(min)
      })
  })
})
