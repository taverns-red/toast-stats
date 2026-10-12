import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #1845 — phone CSS contract for the club grid: legend chips at 14px and a
   44px floor for tiles. jsdom cannot measure these; the 375 smoke
   (e2e/club-grid-mobile.smoke.ts) checks them in real pixels. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const floor = stripComments(read('../mobile-type-floor.css'))
const grid = stripComments(read('../components/club-grid.css'))

/** The declaration block of the floor rule whose selector list names `sel`. */
const floorRuleFor = (sel: string) => {
  const blocks = floor.match(/[^{}]+\{[^{}]*\}/g) ?? []
  return (
    blocks.find(b =>
      (b.split('{')[0] ?? '').split(',').some(s => s.trim() === sel)
    ) ?? ''
  )
}

describe('club grid on phones (#1845)', () => {
  it('sets legend swatches (chips) to 14px, not the 12px glyph tier', () => {
    expect(floorRuleFor('.club-grid-legend__swatch')).toMatch(
      /font-size:\s*14px/
    )
  })

  it('keeps legend labels at 14px', () => {
    expect(floorRuleFor('.club-grid-legend__label')).toMatch(
      /font-size:\s*14px/
    )
  })

  it('gives tiles a 44px floor in both dimensions', () => {
    const tile = grid.match(/\n\.club-grid-tile\s*\{[^}]*\}/)?.[0] ?? ''
    expect(tile).toMatch(/min-height:\s*(4[4-9]|[5-9]\d)px/)
    expect(tile).toMatch(/min-width:\s*44px/)
  })

  it('resets button chrome so a phone tile looks like the desktop link', () => {
    expect(grid).toMatch(/button\.club-grid-tile\s*\{[^}]*text-align:\s*left/)
  })
})
