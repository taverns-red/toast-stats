import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { declsFor, productionCss, prop, rules, srcDir } from './cssColor'

/* #2642 — a global `.tm-h2` at 36px only ever enlarged the RankingCard rank
   number, and 36px is bigger than the 28px page title in the #2650 heading
   ramp. The rank number gets its own scoped size inside the ramp, StatCard
   (no consumers) is gone, and no `tm-h2` class is left anywhere. */

const css = productionCss()
const rankingCard = readFileSync(
  resolve(srcDir, 'components/RankingCard.tsx'),
  'utf-8'
)

describe('rank number type scale (#2642)', () => {
  it('has no global .tm-h2 rule', () => {
    expect(rules(css).filter(r => /\.tm-h2(?![\w-])/.test(r.selector))).toEqual(
      []
    )
  })

  it('RankingCard no longer uses tm-h2', () => {
    expect(rankingCard).not.toMatch(/tm-h2/)
  })

  it('StatCard (no consumers) is deleted', () => {
    expect(existsSync(resolve(srcDir, 'components/StatCard.tsx'))).toBe(false)
  })

  it('the rank number uses a scoped class sized 24-28px in the headline face', () => {
    const cls = /className="(ranking-card__rank)[" ]/.exec(rankingCard)?.[1]
    expect(cls, 'RankingCard rank span has a .ranking-card__rank class').toBe(
      'ranking-card__rank'
    )
    const decls = declsFor(css, '.ranking-card__rank')
    const size = Number(
      /^(\d+(?:\.\d+)?)px$/.exec(prop(decls, 'font-size') ?? '')?.[1]
    )
    expect(size).toBeGreaterThanOrEqual(24)
    expect(size).toBeLessThanOrEqual(28)
    expect(prop(decls, 'font-family')).toBe('var(--tm-font-headline)')
  })
})
