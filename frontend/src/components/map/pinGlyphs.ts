// #2173 red stub: the teardrop geometry and glyph table land in the green step.
import type { PinShape } from './pinModes'

export type PinBody = 'solid' | 'small' | 'outline' | 'dashed'
export interface GlyphMark {
  d: string
  paint: 'fill' | 'stroke'
}
export interface PinGlyph {
  symbol: string
  body: PinBody
  marks: GlyphMark[]
}
export const PIN_TIP_PAD: readonly [number, number] = [0, 0]
export const PIN_GLYPHS = {} as Record<PinShape, PinGlyph>
export function pinBox(_: { selected: boolean; code: string }) {
  return { w: 0, h: 0, tipX: 0, tipY: 0 }
}
export function teardropPath(
  _cx: number,
  _cy: number,
  _r: number,
  _tip: number
): string {
  return ''
}
