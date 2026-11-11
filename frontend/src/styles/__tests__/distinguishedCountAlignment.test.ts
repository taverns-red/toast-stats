// The Distinguished card's rank line must line up with its neighbours
// (#2580, from the #2579 review).
//
// `responsive.css` gives every span `line-height: max(1.4, ...)`. The card
// value is a text-3xl block (30px, unitless 1.2 = 36px strut), but the
// CONFIRMED span DistinguishedCount draws inside it is a span too, so it got
// 30px x 1.5 = 45px and made the line ~9px taller; the rank line below sat
// low. The phone hub solved the same case with `line-height: inherit` on the
// confirmed span. jsdom does no layout, so the contract is pinned on the
// stylesheet and the markup; the preview smoke measures the rendered gap.

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

describe('.distinguished-count__confirmed alignment (#2580)', () => {
  it('inherits the card value line-height instead of the global span 1.5', () => {
    expect(
      standaloneRule('.distinguished-count__confirmed')['line-height']
    ).toBe('inherit')
  })

  it('leaves the provisional span on the global line-height (it was never the cause)', () => {
    expect(
      standaloneRule('.distinguished-count__provisional')['line-height']
    ).toBeUndefined()
  })
})
