/**
 * #2173 — teardrop pins. Every pin is the same location-pin silhouette,
 * coloured by category, with a small glyph inside as the non-colour channel
 * (WCAG 1.4.1): ★ distinguished, ↑ growing, ↓ declining, ! at risk. The
 * glyph table is the one the spec documents
 * (docs/design/map-pin-colour-modes.md §3.2), so these tests hold the map,
 * the legend and the spec to it.
 */
import { describe, expect, it } from 'vitest'
import { PIN_SHAPES, buildModeModel, type PinShape } from '../pinModes'
import { extendedModel } from '../pinExtended'
import {
  PIN_GLYPHS,
  PIN_TIP_PAD,
  pinBox,
  teardropPath,
  type PinBody,
} from '../pinGlyphs'

const DATE = '2026-10-11'

const glyphOf = (shape: PinShape) => PIN_GLYPHS[shape].symbol

describe('the glyph table', () => {
  it('gives every pin shape a glyph and a body', () => {
    for (const shape of PIN_SHAPES) {
      const g = PIN_GLYPHS[shape]
      expect(g, shape).toBeDefined()
      expect(g.symbol, shape).not.toBe('')
      expect(['solid', 'small', 'outline', 'dashed'] as PinBody[]).toContain(
        g.body
      )
    }
  })

  it('never gives two shapes the same glyph, so shape stays the channel', () => {
    const seen = new Map<string, PinShape>()
    for (const shape of PIN_SHAPES) {
      const key = `${PIN_GLYPHS[shape].body}|${glyphOf(shape)}`
      expect(seen.get(key), `${shape} repeats ${seen.get(key)}`).toBeUndefined()
      seen.set(key, shape)
    }
  })

  it('marks health as dot, ! at risk and !! intervention', () => {
    const cats = buildModeModel('health').categories
    const by = (k: string) => glyphOf(cats.find(c => c.key === k)!.shape)
    expect(by('thriving')).toBe('•')
    expect(by('vulnerable')).toBe('!')
    expect(by('intervention-required')).toBe('!!')
  })

  it('stars every Distinguished rung, one more per rung', () => {
    const cats = buildModeModel('tier').categories
    const by = (k: string) => glyphOf(cats.find(c => c.key === k)!.shape)
    expect(by('NotDistinguished')).toBe('○')
    expect(by('Distinguished')).toBe('★')
    expect(by('Select')).toBe('★★')
    expect(by('President')).toBe('★★★')
    expect(by('Smedley')).toBe('★★★★')
  })

  it('points net growth up and down', () => {
    const glyphs = extendedModel('growth', DATE).categories.map(c =>
      glyphOf(c.shape)
    )
    expect(glyphs.slice(0, 5)).toEqual(['↓', '⌄', '•', '⌃', '↑'])
  })

  it('draws suspended and not available as two different outline pins', () => {
    expect(PIN_GLYPHS.suspended.body).toBe('outline')
    expect(PIN_GLYPHS.na.body).toBe('dashed')
    expect(PIN_GLYPHS.suspended.symbol).toBe('⊘')
    expect(PIN_GLYPHS.na.symbol).toBe('?')
  })

  it('has drawable marks for every glyph', () => {
    for (const shape of PIN_SHAPES) {
      for (const m of PIN_GLYPHS[shape].marks) {
        expect(m.d, shape).toMatch(/^M[\d.\- ,A-Za-z]+$/)
        expect(['fill', 'stroke']).toContain(m.paint)
      }
    }
  })
})

describe('pin geometry', () => {
  it('puts the tip at the bottom of the icon, less the stroke pad', () => {
    for (const selected of [false, true]) {
      const box = pinBox({ selected, code: '' })
      expect(box.tipY).toBeCloseTo(box.h - PIN_TIP_PAD[selected ? 1 : 0])
      expect(box.tipX).toBeCloseTo(box.w / 2)
    }
    const badge = pinBox({ selected: false, code: 'B12' })
    expect(badge.tipY).toBeCloseTo(badge.h - PIN_TIP_PAD[0])
    expect(badge.w).toBeGreaterThan(pinBox({ selected: false, code: '' }).w)
  })

  it('draws a selected pin larger than a plain one', () => {
    const plain = pinBox({ selected: false, code: '' })
    const big = pinBox({ selected: true, code: '' })
    expect(big.h).toBeGreaterThan(plain.h)
  })

  it('builds a closed teardrop path ending at its tip', () => {
    const d = teardropPath(10, 10, 9, 26)
    expect(d.startsWith('M10 26')).toBe(true)
    expect(d.trim().endsWith('Z')).toBe(true)
  })
})
