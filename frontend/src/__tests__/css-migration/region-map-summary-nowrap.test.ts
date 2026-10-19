// Region map summary tiles must never break inside a number (#2154).
//
// Live on 2.61.1 at 375 px, the Members tile wrapped "12,974" as "12,97" /
// "4": the three-up summary row (mobile review §6.2) gives each value ~83 px,
// a 24 px bold six-glyph number needs ~85 px, and `overflow-wrap: anywhere`
// let the browser split the digits. The fix keeps the value on one line and
// lets its size step down with the viewport, never below the 18 px floor
// for display numbers (labels stay at the 14 px text floor).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(
  resolve(__dirname, '../../pages/regionMap.css'),
  'utf-8'
)

/** Declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  return match?.[2] ?? ''
}

describe('region map summary value (#2154)', () => {
  const body = ruleBody('.region-map__summary .rollup-kpi__value')

  it('keeps the number on one line', () => {
    expect(body).toMatch(/white-space:\s*nowrap/)
  })

  it('never allows a break inside the digits', () => {
    expect(body).not.toMatch(/overflow-wrap:\s*anywhere/)
    expect(body).not.toMatch(/word-break:\s*break-all/)
  })

  it('keeps tabular figures', () => {
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums/)
  })

  it('scales with the viewport but never below 18px or above 24px', () => {
    const size = body.match(/font-size:\s*clamp\(([^)]*)\)/)
    expect(size, 'font-size: clamp(min, fluid, max)').not.toBeNull()
    const [min, , max] = size![1].split(',').map(s => s.trim())
    expect(min).toBe('18px')
    expect(max).toBe('24px')
  })
})
