/**
 * Area shades for the area pin mode (#2178). Each area takes a shade of its
 * division's hue, and the shades are picked across the whole district so
 * that any two areas read apart, not just neighbouring shades in one
 * division. Split from `pinTerritory` because the colour maths is its own
 * concern.
 */
type Lab = readonly [number, number, number]

// CIELAB (D65).
const lin = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
const gam = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
const WHITE_POINT = [0.95047, 1, 1.08883] as const
const M_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const
const M_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const

function toLab(hex: string): [number, number, number] {
  const rgb = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
  const [fx, fy, fz] = M_XYZ.map((row, i) =>
    f(row.reduce((s, m, j) => s + m * rgb[j]!, 0) / WHITE_POINT[i]!)
  ) as [number, number, number]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Lab → sRGB, or null when out of gamut. */
function fromLab(L: number, a: number, b: number): string | null {
  const fy = (L + 16) / 116
  const inv = (t: number) =>
    t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27)
  const xyz = [fy + a / 500, fy, fy - b / 200].map(
    (t, i) => inv(t) * WHITE_POINT[i]!
  )
  const rgb = M_RGB.map(row => gam(row.reduce((s, m, j) => s + m * xyz[j]!, 0)))
  if (rgb.some(v => v < -0.001 || v > 1.001)) return null
  return (
    '#' +
    rgb
      .map(v =>
        Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase()
  )
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i =>
    lin(parseInt(hex.slice(i, i + 2), 16) / 255)
  ) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const INK_LUMINANCE = luminance('#0F0E0D')

/** Best of white or ink text on `hex`, as `labelColourOn` picks it. */
function labelContrast(hex: string): number {
  const y = luminance(hex)
  return Math.max(1.05 / (y + 0.05), (y + 0.05) / (INK_LUMINANCE + 0.05))
}

const rad = (d: number) => (d * Math.PI) / 180
const hueDeg = (b: number, a: number) =>
  ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005). */
export function deltaE2000(p: Lab, q: Lab): number {
  const [L1, a1, b1] = p
  const [L2, a2, b2] = q
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = hueDeg(b1, a1p)
  const h2p = hueDeg(b2, a2p)
  const chromatic = C1p * C2p !== 0
  let dhp = h2p - h1p
  if (!chromatic) dhp = 0
  else if (dhp > 180) dhp -= 360
  else if (dhp < -180) dhp += 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2))
  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2
  let hbp = h1p + h2p
  if (chromatic)
    hbp =
      Math.abs(h1p - h2p) <= 180
        ? hbp / 2
        : hbp < 360
          ? (hbp + 360) / 2
          : (hbp - 360) / 2
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
  const l = (L2 - L1) / Sl
  const c = (C2p - C1p) / Sc
  const h = dHp / Sh
  return Math.sqrt(l * l + c * c + h * h + Rt * c * h)
}

/**
 * The shades a division hue may take: its own (a*, b*) direction at every
 * L* rung, at full chroma and four tints toward grey. Hue is never moved,
 * so a shade stays visibly its division's. Out-of-gamut shades and shades
 * with no 4.5:1 code label (spec §6.1) are dropped.
 */
const RUNGS = Array.from({ length: 35 }, (_, i) => 22 + 2 * i)
const TINTS = [1, 0.85, 0.7, 0.55, 0.4] as const

/** Machado, Oliveira & Fernandes (2009) severity-1.0 matrices, linear RGB. */
const CVD = [
  [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
] as const

/** `hex` as seen under protan, deutan and tritan vision. */
function simulated(hex: string): Lab[] {
  const rgb = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  return CVD.map(m => {
    const out = m.map(row =>
      Math.min(
        1,
        Math.max(
          0,
          row.reduce((s, k, j) => s + k * rgb[j]!, 0)
        )
      )
    )
    return toLab(
      '#' +
        out
          .map(v =>
            Math.round(gam(v) * 255)
              .toString(16)
              .padStart(2, '0')
          )
          .join('')
    )
  })
}

interface Shade {
  hex: string
  lab: Lab
  /** Protan, deutan, tritan. */
  cvd: Lab[]
}

/**
 * How far apart two picks read. Shades of one division differ only in L*
 * and chroma, and red–green or blue–yellow vision can merge two tints on
 * one rung; so within a division a pair that falls under ΔE 5 under any
 * simulated vision counts as only that far apart.
 */
function distance(p: Pick, q: Pick, floor = -1): number {
  const d = deltaE2000(p.s.lab, q.s.lab)
  if (p.g !== q.g || d <= floor) return d
  let cvd = Infinity
  for (let v = 0; v < 3; v++)
    cvd = Math.min(cvd, deltaE2000(p.s.cvd[v]!, q.s.cvd[v]!))
  return cvd < CVD_FLOOR ? cvd : d
}

/** Least simulated-vision ΔE between two shades of one division. */
const CVD_FLOOR = 5.5

interface Pick {
  g: number
  s: Shade
}

function shadesOf(fill: string): Shade[] {
  const [, a, b] = toLab(fill)
  const seen = new Set<string>()
  const out: Shade[] = []
  for (const L of RUNGS)
    for (const k of TINTS) {
      const hex = fromLab(L, a * k, b * k)
      if (!hex || seen.has(hex)) continue
      seen.add(hex)
      if (labelContrast(hex) >= 4.5)
        out.push({ hex, lab: toLab(hex), cvd: simulated(hex) })
    }
  return out
}

/** The nearest of `others` to `p`, stopping once it is at or below `floor`. */
function nearest(p: Pick, others: readonly Pick[], floor: number): number {
  let min = Infinity
  for (const o of others) {
    min = Math.min(min, distance(p, o, floor))
    if (min <= floor) break
  }
  return min
}

/**
 * Shades for every division at once (#2178): `groups[g].count` shades of
 * `groups[g].fill`, returned dark to light. A greedy max–min pick (always
 * take the free shade farthest from every shade taken so far) seeds a
 * local search that moves each shade, in turn, to the one of its
 * division's shades farthest from all the others, until nothing moves.
 * Shades on the same rung of two near-hues (olive and sand) used to land
 * at ΔE 4.5; picking district-wide spreads them across rungs and tints.
 * Deterministic: ties go to the earlier group and the darker, fuller shade.
 */
export function areaShades(
  groups: readonly { fill: string; count: number }[]
): string[][] {
  const pools = groups.map(g => shadesOf(g.fill))
  const picks: Pick[] = []
  const free = pools.map((pool, g) =>
    pool.map(s => ({ pick: { g, s }, d: Infinity }))
  )
  const left = groups.map(g => g.count)
  const total = left.reduce((a, n) => a + n, 0)
  while (picks.length < total) {
    let best: (typeof free)[number][number] | undefined
    for (let g = 0; g < free.length; g++) {
      if (left[g]! === 0) continue
      for (const c of free[g]!) if (!best || c.d > best.d) best = c
    }
    // A pool smaller than its count repeats its shades rather than fail.
    if (!best) break
    const chosen = best
    picks.push(chosen.pick)
    left[chosen.pick.g]!--
    free[chosen.pick.g] = free[chosen.pick.g]!.filter(c => c !== chosen)
    for (const pool of free)
      for (const c of pool) c.d = Math.min(c.d, distance(c.pick, chosen.pick))
  }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let moved = false
    for (let i = 0; i < picks.length; i++) {
      const here = picks[i]!
      const others = picks.filter((_, j) => j !== i)
      const taken = new Set(picks.map(p => p.s.hex))
      let best = here
      let bestD = nearest(here, others, -1)
      for (const s of pools[here.g]!) {
        if (taken.has(s.hex)) continue
        const cand = { g: here.g, s }
        const d = nearest(cand, others, bestD + EPSILON)
        if (d > bestD + EPSILON) {
          bestD = d
          best = cand
        }
      }
      if (best !== here) {
        picks[i] = best
        moved = true
      }
    }
    if (!moved) break
  }
  return groups.map((g, i) => {
    const mine = picks
      .filter(p => p.g === i)
      .map(p => p.s)
      .sort((x, y) => x.lab[0] - y.lab[0])
      .map(s => s.hex)
    const fallback = mine.length ? mine : [g.fill]
    return Array.from(
      { length: g.count },
      (_, k) => fallback[k % fallback.length]!
    )
  })
}

/** Local-search bounds: rounds before giving up, and the least gain kept. */
const MAX_ROUNDS = 12
const EPSILON = 1e-6
