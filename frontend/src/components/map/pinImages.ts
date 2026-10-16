/**
 * Draw pin and cluster icons from their id (#1784, spec §3.1 and §8).
 *
 * MapLibre asks for a missing image by id (its missing-image resolver); this draws
 * it on a 2D canvas at the device pixel ratio. No glyphs, no sprite, no
 * network: the text on clusters and territory badges uses the page's own
 * self-hosted font.
 */
import { OUTLINE, SUSPENDED_FILL, labelColourOn } from './pinModes'
import type { IconSpec, MapTheme } from './pinLayer'

/** Behind fill-level pins and inside the selected pin's double ring: the
 * basemap land, --surface light and --surface-2 dark (#2087). */
export const HALO: Record<MapTheme, string> = {
  light: '#FFFFFF',
  dark: '#161F2A',
}
const FONT = 'Inter, system-ui, sans-serif'
const FILL_LEVEL: Record<string, number> = {
  fill0: 0,
  fill25: 0.25,
  fill50: 0.5,
  fill75: 0.75,
  fill100: 1,
}

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
  return { el, ctx }
}

function shapePath(
  ctx: CanvasRenderingContext2D,
  shape: string,
  cx: number,
  cy: number,
  r: number
) {
  ctx.beginPath()
  if (shape === 'triangle' || shape === 'up' || shape === 'upHalf') {
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx + r * 0.95, cy + r * 0.75)
    ctx.lineTo(cx - r * 0.95, cy + r * 0.75)
    ctx.closePath()
  } else if (shape === 'down' || shape === 'downHalf') {
    // Net growth's decline arrows (spec §3.2, direction family).
    ctx.moveTo(cx, cy + r)
    ctx.lineTo(cx + r * 0.95, cy - r * 0.75)
    ctx.lineTo(cx - r * 0.95, cy - r * 0.75)
    ctx.closePath()
  } else if (shape === 'square') {
    const s = r * 0.85
    ctx.rect(cx - s, cy - s, 2 * s, 2 * s)
  } else if (shape === 'diamond') {
    // ◆ Ineligible / coaching complete (spec §3.2, status shapes).
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx + r, cy)
    ctx.lineTo(cx, cy + r)
    ctx.lineTo(cx - r, cy)
    ctx.closePath()
  } else {
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
  }
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  spec: Extract<IconSpec, { kind: 'pin' }>,
  w: number,
  h: number
) {
  const outline = OUTLINE[spec.theme]
  const cx = w / 2
  const cy = h / 2
  if (spec.code) {
    // Territory badge: a rounded rectangle carrying the code (spec §7.3).
    ctx.beginPath()
    ctx.roundRect(1, 1, w - 2, h - 2, 6)
    ctx.fillStyle = spec.fill
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = outline
    ctx.stroke()
    ctx.fillStyle = labelColourOn(spec.fill)
    ctx.font = `700 11px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(spec.code, cx, cy + 0.5)
    return
  }
  const r = (spec.selected ? 20 : 14) / 2 - 1
  if (spec.selected) {
    // Double ring: outline colour, then the halo (never amber: spec §3.1).
    shapePath(ctx, spec.shape, cx, cy, r + 4)
    ctx.fillStyle = outline
    ctx.fill()
    shapePath(ctx, spec.shape, cx, cy, r + 2)
    ctx.fillStyle = HALO[spec.theme]
    ctx.fill()
  }
  const level = FILL_LEVEL[spec.shape]
  if (spec.shape === 'na') {
    // ◌ Not available: a 70 % hollow ring, no outline (spec §3.2).
    shapePath(ctx, 'circle', cx, cy, r * 0.7)
    ctx.lineWidth = 2
    ctx.strokeStyle = spec.fill
    ctx.stroke()
    return
  }
  if (spec.shape === 'dot') {
    // A small dot: the quiet "nothing to flag" state (no coach).
    shapePath(ctx, 'circle', cx, cy, r * 0.55)
    ctx.fillStyle = spec.fill
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = outline
    ctx.stroke()
    return
  }
  if (spec.shape === 'upHalf' || spec.shape === 'downHalf') {
    // The smaller step: the arrow drawn open, in its fill colour.
    shapePath(ctx, spec.shape, cx, cy, r)
    ctx.fillStyle = HALO[spec.theme]
    ctx.fill()
    shapePath(ctx, spec.shape, cx, cy, r - 2.5)
    ctx.lineWidth = 2
    ctx.strokeStyle = spec.fill
    ctx.stroke()
  } else if (spec.shape === 'suspended') {
    shapePath(ctx, 'circle', cx, cy, r)
    ctx.fillStyle = HALO[spec.theme]
    ctx.fill()
    ctx.lineWidth = 2.5
    ctx.strokeStyle = SUSPENDED_FILL
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.7, cy + r * 0.7)
    ctx.lineTo(cx + r * 0.7, cy - r * 0.7)
    ctx.stroke()
  } else if (level !== undefined) {
    // Fill level: the share of the disc filled, clockwise from 12 o'clock.
    shapePath(ctx, 'circle', cx, cy, r)
    ctx.fillStyle = HALO[spec.theme]
    ctx.fill()
    if (level > 0) {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + level * Math.PI * 2)
      ctx.closePath()
      ctx.fillStyle = spec.fill
      ctx.fill()
    }
    shapePath(ctx, 'circle', cx, cy, r - 1)
    ctx.lineWidth = 2
    ctx.strokeStyle = spec.fill
    ctx.stroke()
  } else {
    shapePath(ctx, spec.shape, cx, cy, r)
    ctx.fillStyle = spec.fill
    ctx.fill()
  }
  shapePath(
    ctx,
    spec.shape === 'suspended' || level !== undefined ? 'circle' : spec.shape,
    cx,
    cy,
    r
  )
  ctx.lineWidth = 1.5
  ctx.strokeStyle = outline
  // A provisional tier is dashed (spec §4.1, "Projected").
  ctx.setLineDash(spec.dashed ? [2.5, 2] : [])
  ctx.stroke()
  ctx.setLineDash([])
}

/** Cluster sizes: 32 / 40 / 48 px for < 10, 10–99, 100+ clubs (spec §8). */
export function clusterDiameter(count: number): number {
  return count < 10 ? 32 : count < 100 ? 40 : 48
}

function drawCluster(
  ctx: CanvasRenderingContext2D,
  spec: Extract<IconSpec, { kind: 'cluster' }>,
  size: number
) {
  const d = clusterDiameter(spec.count)
  const c = size / 2
  ctx.beginPath()
  ctx.arc(c, c, d / 2 - 1, 0, Math.PI * 2)
  ctx.fillStyle = spec.fill
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = OUTLINE[spec.theme]
  ctx.stroke()
  ctx.fillStyle = labelColourOn(spec.fill)
  ctx.font = `700 14px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(spec.count), c, c + 0.5)
  if (spec.pip) {
    // Attention pip on the rim at 45°: the exception category's square.
    const at = c + (d / 2 - 1) * Math.SQRT1_2
    ctx.beginPath()
    ctx.rect(at - 5, c - (at - c) - 5, 10, 10)
    ctx.fillStyle = spec.pip
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = OUTLINE[spec.theme]
    ctx.stroke()
  }
}

export function drawIcon(spec: IconSpec, dpr: number): DrawnIcon | null {
  let w: number
  let h: number
  if (spec.kind === 'cluster') {
    w = h = clusterDiameter(spec.count) + 8
  } else if (spec.code) {
    w = Math.max(20, spec.code.length * 8 + 10)
    h = 18
  } else {
    w = h = spec.selected ? 30 : 16
  }
  const c = canvas(w, h, dpr)
  if (!c) return null
  if (spec.kind === 'cluster') drawCluster(c.ctx, spec, w)
  else drawPin(c.ctx, spec, w, h)
  const img = c.ctx.getImageData(0, 0, c.el.width, c.el.height)
  return { width: img.width, height: img.height, data: img.data }
}
