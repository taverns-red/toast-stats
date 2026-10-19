/**
 * Draw pin and cluster icons from their id (#1784, spec §3.1 and §8):
 * teardrop pins with a glyph inside, and clusters to match (#2173).
 *
 * MapLibre asks for a missing image by id (its missing-image resolver); this draws
 * it on a 2D canvas at the device pixel ratio. No glyphs, no sprite, no
 * network: the text on clusters and territory badges uses the page's own
 * self-hosted font.
 */
import { OUTLINE, labelColourOn } from './pinModes'
import type { IconSpec, MapTheme } from './pinLayer'
import {
  PIN_GLYPHS,
  PIN_TIP_PAD,
  glyphTransform,
  pinBodyPath,
  pinBox,
  type GlyphMark,
  type PinBox,
} from './pinGlyphs'

/** Behind fill-level pins and inside the selected pin's double ring: the
 * basemap land, --surface light and --surface-2 dark (#2087). */
export const HALO: Record<MapTheme, string> = {
  light: '#FFFFFF',
  dark: '#161F2A',
}
const FONT = 'Inter, system-ui, sans-serif'

export interface DrawnIcon {
  width: number
  height: number
  data: Uint8ClampedArray
}

function canvas(cssW: number, cssH: number, dpr: number) {
  const el = document.createElement('canvas')
  el.width = Math.ceil(cssW * dpr)
  el.height = Math.ceil(cssH * dpr)
  const ctx = el.getContext('2d')
  if (!ctx) return null
  ctx.scale(dpr, dpr)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  return { el, ctx }
}

/** The glyph's marks, in head units, at the head (#2173). */
function drawMarks(
  ctx: CanvasRenderingContext2D,
  marks: readonly GlyphMark[],
  at: { x: number; y: number; k: number },
  colour: string
) {
  ctx.save()
  ctx.translate(at.x, at.y)
  ctx.scale(at.k, at.k)
  ctx.fillStyle = colour
  ctx.strokeStyle = colour
  for (const m of marks) {
    const path = new Path2D(m.d)
    if (m.paint === 'fill') ctx.fill(path)
    else {
      ctx.lineWidth = m.width ?? 1.8
      ctx.stroke(path)
    }
  }
  ctx.restore()
}

/** A teardrop pin (#2173): the body in the category fill with the glyph
 *  inside; suspended and not available are hollow. A territory code makes
 *  the head a badge carrying the code (spec §7.3). */
function drawPin(
  ctx: CanvasRenderingContext2D,
  spec: Extract<IconSpec, { kind: 'pin' }>,
  box: PinBox
) {
  const outline = OUTLINE[spec.theme]
  const halo = HALO[spec.theme]
  const glyph = PIN_GLYPHS[spec.shape]
  const body = spec.code ? 'solid' : glyph.body
  const path = new Path2D(pinBodyPath(box, body))
  if (spec.selected) {
    // Double ring: outline colour, then the halo (never amber: spec §3.1).
    ctx.lineWidth = PIN_TIP_PAD[1] * 2
    ctx.strokeStyle = outline
    ctx.stroke(path)
    ctx.lineWidth = PIN_TIP_PAD[1] * 2 - 3
    ctx.strokeStyle = halo
    ctx.stroke(path)
  }
  const hollow = body === 'outline' || body === 'dashed'
  ctx.fillStyle = hollow ? halo : spec.fill
  ctx.fill(path)
  ctx.lineWidth = hollow ? 2 : 1.5
  ctx.strokeStyle = hollow ? spec.fill : outline
  // Not available, and a provisional tier, are dashed (spec §4.1).
  ctx.setLineDash(body === 'dashed' || spec.dashed ? [3, 2] : [])
  ctx.stroke(path)
  ctx.setLineDash([])
  const ink = hollow ? spec.fill : labelColourOn(spec.fill)
  if (spec.code && box.head.kind === 'badge') {
    ctx.fillStyle = ink
    ctx.font = `700 11px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(spec.code, box.tipX, box.head.y + box.head.bh / 2 + 0.5)
    return
  }
  drawMarks(ctx, glyph.marks, glyphTransform(box, body), ink)
}

/** Cluster sizes: 24 / 28 / 34 px for < 10, 10–99, 100+ clubs (spec §8).
 *  #2173: about a pin's width, since groups now form only where pins
 *  overlap (20 px) and neighbouring groups sit that close. */
export function clusterDiameter(count: number): number {
  return count < 10 ? 24 : count < 100 ? 28 : 34
}

/** A cluster in the pins' style (#2173): a solid disc in its fill with the
 *  pin outline, a halo ring inside it, the count, and the attention pip as a
 *  small "!" badge on the rim. */
function drawCluster(
  ctx: CanvasRenderingContext2D,
  spec: Extract<IconSpec, { kind: 'cluster' }>,
  size: number
) {
  const d = clusterDiameter(spec.count)
  const c = size / 2
  const outline = OUTLINE[spec.theme]
  ctx.beginPath()
  ctx.arc(c, c, d / 2 - 1, 0, Math.PI * 2)
  ctx.fillStyle = spec.fill
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = outline
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c, c, d / 2 - 3, 0, Math.PI * 2)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = HALO[spec.theme]
  ctx.stroke()
  ctx.fillStyle = labelColourOn(spec.fill)
  ctx.font = `700 ${spec.count < 100 ? 12 : 11}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(spec.count), c, c + 0.5)
  if (spec.pip) {
    // Attention pip on the rim at 45°: the exception category's colour,
    // carrying the "!" the pins use.
    const at = c + (d / 2 - 1) * Math.SQRT1_2
    const py = c - (at - c)
    ctx.beginPath()
    ctx.arc(at, py, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = spec.pip
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = outline
    ctx.stroke()
    drawMarks(
      ctx,
      PIN_GLYPHS.triangle.marks,
      { x: at, y: py, k: 0.5 },
      labelColourOn(spec.pip)
    )
  }
}

export function drawIcon(spec: IconSpec, dpr: number): DrawnIcon | null {
  const box = spec.kind === 'pin' ? pinBox(spec) : null
  const w = spec.kind === 'cluster' ? clusterDiameter(spec.count) + 8 : box!.w
  const h = box ? box.h : w
  const c = canvas(w, h, dpr)
  if (!c) return null
  if (spec.kind === 'cluster') drawCluster(c.ctx, spec, w)
  else drawPin(c.ctx, spec, box!)
  const img = c.ctx.getImageData(0, 0, c.el.width, c.el.height)
  return { width: img.width, height: img.height, data: img.data }
}
