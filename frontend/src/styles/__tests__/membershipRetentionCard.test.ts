// /awards membership retention card styles (#1614).
//
// jsdom does no layout, so the 375px contract is pinned on the stylesheet,
// the same way awardsTiedChip.test.ts does: the new text joins the phone
// 14px floor (the 375 gate ratchets the share of small characters), the
// estimate and winner tags share the tied chip's legacy-palette shape, and
// the "(727 of 869)" detail wraps as one unit instead of squeezing the name.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const css = strip(
  readFileSync(resolve(__dirname, '../components/app-shell.css'), 'utf-8')
)
const floor = strip(
  readFileSync(resolve(__dirname, '../mobile-type-floor.css'), 'utf-8')
)

/** Selector lists and bodies of every rule that names `sel`. */
function rulesFor(sel: string): Array<{ selectors: string[]; body: string }> {
  const out: Array<{ selectors: string[]; body: string }> = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (m[1] ?? '').split(',').map(s => s.trim())
    if (selectors.includes(sel)) out.push({ selectors, body: m[2] ?? '' })
  }
  return out
}

describe('/awards membership retention card (#1614)', () => {
  it.each(['.awards-page-card__tag', '.awards-page-card__winner'])(
    '%s shares the tied chip rule',
    sel => {
      const shared = rulesFor(sel).find(r =>
        r.selectors.includes('.awards-page-card__tied')
      )
      expect(shared, `${sel} grouped with .awards-page-card__tied`).toBeTruthy()
    }
  )

  it('the value detail wraps as one unit', () => {
    const body = rulesFor('.awards-page-card__value-detail')
      .map(r => r.body)
      .join(';')
    expect(body).toMatch(/white-space:\s*nowrap/)
    expect(body).toMatch(/display:\s*inline-block/)
  })

  it('the footnote has its own rule', () => {
    expect(rulesFor('.awards-page-card__footnote').length).toBeGreaterThan(0)
  })

  const block = /([^{}]*\.awards-page-card__row,[^{}]*)\{([^}]*)\}/.exec(floor)
  it.each([
    '.awards-page-card__tag',
    '.awards-page-card__winner',
    '.awards-page-card__footnote',
    '.awards-page-card__status',
  ])('%s is in the phone 14px group', sel => {
    expect(block, 'awards rule in mobile-type-floor.css').not.toBeNull()
    expect(block![1].split(',').map(s => s.trim())).toContain(sel)
  })
})
