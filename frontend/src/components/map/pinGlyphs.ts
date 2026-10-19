/**
 * Teardrop pin geometry and the glyph table (#2173), shared by the canvas
 * painter (`pinImages`) and the legend swatch (`PinSwatch`), so the map and
 * the legend cannot drift (Lesson 052).
 *
 * Every pin is the same location-pin silhouette whose tip sits on the club's
 * coordinate (`icon-anchor: bottom`). The body is coloured by category. A
 * small glyph inside is the non-colour channel (WCAG 1.4.1): white, or ink
 * on a pale fill for contrast. Each `PinShape` names one glyph, so the modes
 * (`pinModes`, `pinExtended`, `pinReports`, `pinMeeting`) keep their
 * vocabulary and every category of every mode gets a glyph. The table is
 * documented in docs/design/map-pin-colour-modes.md §3.2.
 *
 * Glyph marks are SVG path data in head units: centre (0, 0), head radius
 * `HEAD_R`. Pure: no DOM, no MapLibre.
 */
import type { PinShape } from './pinModes'

/** solid: the category fill. small: a smaller solid pin (a quiet state).
 *  outline / dashed: a hollow pin stroked in the category fill (suspended,
 *  not available). */
export type PinBody = 'solid' | 'small' | 'outline' | 'dashed'

export interface GlyphMark {
  d: string
  paint: 'fill' | 'stroke'
  /** Stroke width in head units (default 1.8). */
  width?: number
}

export interface PinGlyph {
  /** The glyph in text, for the spec and the docs. */
  symbol: string
  body: PinBody
  marks: GlyphMark[]
}

/** The head radius the marks are drawn at. */
export const HEAD_R = 8.5

const n = (v: number) => String(Math.round(v * 100) / 100)

const disc = (r: number, cx = 0, cy = 0): string =>
  `M${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx + r)} ${n(cy)}Z`

/** A five-point star, point up. */
function star(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${n(cx + rad * Math.cos(a))} ${n(cy + rad * Math.sin(a))}`)
  }
  return `M${pts.join('L')}Z`
}

const fill = (d: string): GlyphMark => ({ d, paint: 'fill' })
const stroke = (d: string, width?: number): GlyphMark => ({
  d,
  paint: 'stroke',
  ...(width ? { width } : {}),
})

/** "!" centred at x. */
const bang = (x: number): GlyphMark[] => [
  fill(`M${n(x - 1.25)} -5.2H${n(x + 1.25)}L${n(x + 0.8)} 1.4H${n(x - 0.8)}Z`),
  fill(disc(1.3, x, 3.6)),
]

const GAUGE_R = 4

/** A gauge: a ring with the share filled, clockwise from 12 o'clock. */
function gauge(level: number): GlyphMark[] {
  const ring = stroke(disc(GAUGE_R), 1.6)
  if (level <= 0) return [ring]
  if (level >= 1) return [fill(disc(GAUGE_R + 0.8))]
  const a = -Math.PI / 2 + level * Math.PI * 2
  const wedge = `M0 0V${n(-GAUGE_R)}A${GAUGE_R} ${GAUGE_R} 0 ${level > 0.5 ? 1 : 0} 1 ${n(GAUGE_R * Math.cos(a))} ${n(GAUGE_R * Math.sin(a))}Z`
  return [ring, fill(wedge)]
}

const solid = (symbol: string, marks: GlyphMark[]): PinGlyph => ({
  symbol,
  body: 'solid',
  marks,
})

export const PIN_GLYPHS: Record<PinShape, PinGlyph> = {
  // Good / done / neutral (and every categorical mode, whose code label or
  // territory label carries the identity).
  circle: solid('•', [fill(disc(2.6))]),
  // Warning / partial: at risk.
  triangle: solid('!', bang(0)),
  // Needs action.
  square: solid('!!', [...bang(-2.4), ...bang(2.4)]),
  // Ineligible / coaching complete: the other end state.
  diamond: solid('◆', [fill('M0 -4.6L4.6 0L0 4.6L-4.6 0Z')]),
  // Nothing to flag (no coach, not stated): a smaller, quieter pin.
  dot: { symbol: '·', body: 'small', marks: [] },
  // Ordinal bins: a gauge, 0 % to 100 % filled.
  fill0: solid('○', gauge(0)),
  fill25: solid('◔', gauge(0.25)),
  fill50: solid('◑', gauge(0.5)),
  fill75: solid('◕', gauge(0.75)),
  fill100: solid('●', gauge(1)),
  // Distinguished rungs: one more star per rung.
  star1: solid('★', [fill(star(0, 0.4, 5.2))]),
  star2: solid('★★', [fill(star(-2.9, 0.3, 3.4)), fill(star(2.9, 0.3, 3.4))]),
  star3: solid('★★★', [
    fill(star(0, -2.6, 3)),
    fill(star(-3, 2.5, 3)),
    fill(star(3, 2.5, 3)),
  ]),
  star4: solid('★★★★', [
    fill(star(-2.7, -2.6, 2.7)),
    fill(star(2.7, -2.6, 2.7)),
    fill(star(-2.7, 2.7, 2.7)),
    fill(star(2.7, 2.7, 2.7)),
  ]),
  // Net growth: the big step an arrow, the small step a chevron.
  up: solid('↑', [fill('M0 -5.2L4.6 -0.4H1.6V5H-1.6V-0.4H-4.6Z')]),
  upHalf: solid('⌃', [stroke('M-4 2.2L0 -2.4L4 2.2', 2.2)]),
  down: solid('↓', [fill('M0 5.2L4.6 0.4H1.6V-5H-1.6V0.4H-4.6Z')]),
  downHalf: solid('⌄', [stroke('M-4 -2.2L0 2.4L4 -2.2', 2.2)]),
  // Shared states: hollow pins, never a category fill.
  suspended: {
    symbol: '⊘',
    body: 'outline',
    marks: [stroke(disc(4.2), 1.6), stroke('M-3 3L3 -3', 1.8)],
  },
  na: {
    symbol: '?',
    body: 'dashed',
    marks: [
      stroke('M-2.4 -2.2A2.5 2.5 0 1 1 1.2 0C0.3 0.6 0 1.1 0 2', 1.8),
      fill(disc(1.1, 0, 4.4)),
    ],
  },
}

/** The pin layers' `icon-offset` (CSS px): the stroke below the tip, so the
 *  tip itself lands on the coordinate. [plain, selected]. */
export const PIN_TIP_PAD: readonly [number, number] = [1, 3.5]

/** A selected pin draws this much larger, inside its double ring. */
const SELECTED_SCALE = 1.3
/** The tip sits this many head radii below the head's centre. */
const TIP_REACH = 1.8
/** A code badge's head height and its pointer's height. */
const BADGE_H = 18
const BADGE_TIP = 6
/** A `small` body's head, as a share of the full head. */
const SMALL = 0.72

export interface PinBox {
  w: number
  h: number
  tipX: number
  tipY: number
  /** Teardrop head, or the code badge's rectangle. */
  head:
    | { kind: 'drop'; cx: number; cy: number; r: number }
    | { kind: 'badge'; x: number; y: number; bw: number; bh: number }
}

export function badgeWidth(code: string): number {
  return Math.max(20, code.length * 8 + 10)
}

/** The icon canvas for a pin, in CSS px, and where its tip and head sit. */
export function pinBox(spec: { selected: boolean; code: string }): PinBox {
  const pad = PIN_TIP_PAD[spec.selected ? 1 : 0]
  if (spec.code) {
    const bw = badgeWidth(spec.code)
    const w = bw + 2 * pad
    const tipY = pad + BADGE_H + BADGE_TIP
    return {
      w,
      h: tipY + pad,
      tipX: w / 2,
      tipY,
      head: { kind: 'badge', x: pad, y: pad, bw, bh: BADGE_H },
    }
  }
  const r = spec.selected ? HEAD_R * SELECTED_SCALE : HEAD_R
  // Whole-pixel canvases, so the bottom anchor plus the pad is exact.
  const w = Math.ceil(2 * (r + pad))
  const cy = pad + r
  const tipY = Math.ceil(cy + r * TIP_REACH + pad) - pad
  return {
    w,
    h: tipY + pad,
    tipX: w / 2,
    tipY,
    head: { kind: 'drop', cx: w / 2, cy, r },
  }
}

/** How far above the coordinate a plain pin's head centre sits (CSS px):
 *  where a keyboard focus ring and the nearest-pin test aim. */
export const PIN_HEAD_LIFT = (() => {
  const b = pinBox({ selected: false, code: '' })
  return b.head.kind === 'drop' ? b.tipY - b.head.cy : 0
})()

/** The teardrop: straight sides tangent to the head, meeting at the tip. */
export function teardropPath(
  cx: number,
  cy: number,
  r: number,
  tipY: number
): string {
  const beta = Math.acos(r / (tipY - cy))
  const dx = r * Math.sin(beta)
  const dy = r * Math.cos(beta)
  return (
    `M${n(cx)} ${n(tipY)}` +
    `L${n(cx + dx)} ${n(cy + dy)}` +
    `A${n(r)} ${n(r)} 0 1 0 ${n(cx - dx)} ${n(cy + dy)}Z`
  )
}

/** A code badge: a rounded rectangle with a pointer down to the tip. */
function badgePath(box: PinBox): string {
  if (box.head.kind !== 'badge') return ''
  const { x, y, bw, bh } = box.head
  const rr = 6
  const b = y + bh
  const half = BADGE_TIP * 0.8
  return (
    `M${n(x + rr)} ${n(y)}H${n(x + bw - rr)}` +
    `A${rr} ${rr} 0 0 1 ${n(x + bw)} ${n(y + rr)}V${n(b - rr)}` +
    `A${rr} ${rr} 0 0 1 ${n(x + bw - rr)} ${n(b)}` +
    `H${n(box.tipX + half)}L${n(box.tipX)} ${n(box.tipY)}L${n(box.tipX - half)} ${n(b)}` +
    `H${n(x + rr)}A${rr} ${rr} 0 0 1 ${n(x)} ${n(b - rr)}V${n(y + rr)}` +
    `A${rr} ${rr} 0 0 1 ${n(x + rr)} ${n(y)}Z`
  )
}

/** Where the glyph marks go: the head centre, and the scale from head
 *  units. A `small` body is a smaller head on the same tip. */
export function glyphTransform(
  box: PinBox,
  body: PinBody
): { x: number; y: number; k: number } {
  if (box.head.kind !== 'drop') return { x: box.tipX, y: 0, k: 1 }
  const { cx, cy, r } = box.head
  if (body !== 'small') return { x: cx, y: cy, k: r / HEAD_R }
  const sr = r * SMALL
  return { x: cx, y: box.tipY - sr * TIP_REACH, k: sr / HEAD_R }
}

/** The pin's outline path, for its box and body. */
export function pinBodyPath(box: PinBox, body: PinBody): string {
  if (box.head.kind === 'badge') return badgePath(box)
  const t = glyphTransform(box, body)
  return teardropPath(t.x, t.y, HEAD_R * t.k, box.tipY)
}
