// "+N provisional" must not push the Distinguished card's rank line down
// (#2580, from the #2579 review).
//
// The card value is `text-3xl` (a fixed-length line-height), and the 12px
// provisional span inherits that length. Its inline box is then as tall as
// the headline's, baseline-aligned, and the line box grows by ~11px: the
// Distinguished card's rank line sat lower than its neighbours'. jsdom does
// no layout, so the contract is pinned on the stylesheet: the span sets its
// own unitless line-height so it can never be taller than its 12px text.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(
  resolve(__dirname, '../components/district-hub.css'),
  'utf-8'
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Declarations of the rule whose selector is exactly `sel` (a rule of its
 *  own, not a descendant selector that merely ends in it). */
function standaloneRule(sel: string): Record<string, string> {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|[{}])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  if (!m || m[1] === undefined) throw new Error(`rule not found: ${sel}`)
  return Object.fromEntries(
    m[1]
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const i = d.indexOf(':')
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
      })
  )
}

describe('.distinguished-count__provisional alignment (#2580)', () => {
  const rule = standaloneRule('.distinguished-count__provisional')

  it('sets its own unitless line-height of at most 1.25, not the inherited one', () => {
    const lh = Number(rule['line-height'])
    expect(Number.isFinite(lh)).toBe(true)
    expect(lh).toBeLessThanOrEqual(1.25)
  })

  it('stays baseline-aligned with the headline', () => {
    expect(rule['vertical-align'] ?? 'baseline').toBe('baseline')
  })
})
