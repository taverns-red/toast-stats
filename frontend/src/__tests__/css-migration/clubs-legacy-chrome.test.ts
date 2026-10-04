// /clubs legacy-chrome guard (#1606)
//
// The /clubs hub and /clubs/race/:tier pages (#1556) were styled with the Red
// Taverns v1 tokens (`--rt-*`: beige `--rt-paper-2` cards, amber `--rt-stats`
// accents, Space Grotesk headings, a grey JetBrains Mono eyebrow) while every
// other top-level page still wears the legacy chrome (redesign tokens:
// `--surface` / `--line` / `--ink*` / `--serif`, TM loyal-blue accents, the
// shared red `.placeholder-page__eyebrow`). The Phase 2 brand chrome migration
// is blocked (ops#37), so the pages must match the legacy look until it
// lands. This guard pins that so the Brand v1 tokens can't creep back in.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf-8')
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const css = stripCssComments(read('styles/components/clubs-race.css'))

/** The declaration block of the first rule whose selector is exactly `sel`. */
function rule(sel: string): string {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  if (!m || m[2] === undefined) throw new Error(`rule not found: ${sel}`)
  return m[2]
}

const PAGES = [
  'pages/ClubsWorldPage.tsx',
  'pages/ClubsRacePage.tsx',
  'components/clubs/RaceChart.tsx',
  'components/clubs/RacePodium.tsx',
  'components/clubs/RaceTable.tsx',
]

describe('/clubs legacy chrome (#1606)', () => {
  it('clubs-race.css references no Brand v1 --rt-* token', () => {
    expect(css.match(/--rt-[a-z0-9-]+/g) ?? []).toEqual([])
  })

  it('no longer defines a page-local eyebrow', () => {
    expect(css).not.toContain('.clubs-page__eyebrow')
  })

  it('the pages and race components use the shared eyebrow, not a local one', () => {
    for (const p of PAGES) {
      expect(read(p), p).not.toContain('clubs-page__eyebrow')
    }
    expect(read('pages/ClubsWorldPage.tsx')).toContain(
      'placeholder-page__eyebrow'
    )
    expect(read('pages/ClubsRacePage.tsx')).toContain(
      'placeholder-page__eyebrow'
    )
  })

  it.each(['.clubs-kpi', '.race-podium__rank', '.race-basis'])(
    '%s sits on the legacy card surface (white, cool-grey line, shared radius)',
    sel => {
      const block = rule(sel)
      expect(block).toMatch(/background(-color)?:\s*var\(--surface\)/)
      expect(block).toMatch(/border[a-z-]*:[^;]*var\(--line\)/)
      expect(block).toContain('var(--rds-radius-md)')
    }
  )

  it.each(['.clubs-section__title', '.clubs-kpi__value'])(
    '%s uses the legacy Montserrat display face',
    sel => {
      expect(rule(sel)).toContain('font-family: var(--serif)')
    }
  )

  it('the race chart paints tiers from the legacy tier palette, not Brand v1 hexes', () => {
    const chart = read('components/clubs/RaceChart.tsx')
    for (const hex of ['#D4873F', '#E63946', '#8E1B25', '#3D3B38']) {
      expect(chart.toUpperCase()).not.toContain(hex)
    }
  })
})
