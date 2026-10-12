// /clubs podium district chip (#1617, #1839)
//
// The "D80" chip beside each podium club is an `a[href]`. #1617 kept it a
// compact pill (not a 44px circle under its 999px radius) with a ≥44px hit
// area. #1839 inverts how: the LINK's own box is the 44px target and the
// visible 23px pill is drawn by ::before. #1617's version (a 23px link with a
// 44px ::before overlay) had a real 44px hit area but a 40×23 link box, which
// is what tap audits and assistive tech measure — the 2.48.0 prod sweep
// flagged all 12. jsdom does no layout, so the contract is pinned on the
// stylesheet; e2e/touch-targets.smoke.ts measures the rendered box.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(
  resolve(__dirname, '../components/clubs-race.css'),
  'utf-8'
).replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of the first rule whose selector is exactly `sel`. */
function rule(sel: string): Record<string, string> {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  if (!m || m[2] === undefined) throw new Error(`rule not found: ${sel}`)
  return Object.fromEntries(
    m[2]
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const i = d.indexOf(':')
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
      })
  )
}

describe('/clubs podium district chip (#1617, #1839)', () => {
  it('the link itself is the ≥44px target, with its label centred', () => {
    const chip = rule('.race-podium__district')
    expect(chip['min-height']).toBe('44px')
    expect(chip['min-width']).toBe('44px')
    expect(chip['display']).toBe('inline-flex')
    expect(chip['align-items']).toBe('center')
    expect(chip['justify-content']).toBe('center')
    // Anchors the pill pseudo-element to the link.
    expect(chip['position']).toBe('relative')
    // The link box carries no pill chrome — that would be a 44px circle.
    expect(chip['border-radius']).toBeUndefined()
    expect(chip['border']).toBeUndefined()
  })

  it('draws the compact pill with ::before, centred and click-through', () => {
    const pill = rule('.race-podium__district::before')
    expect(pill['content']).toBe("''")
    expect(pill['position']).toBe('absolute')
    expect(pill['border-radius']).toBe('999px')
    expect(pill['left']).toBe('0')
    expect(pill['right']).toBe('0')
    expect(pill['top']).toBe('50%')
    expect(pill['transform']).toBe('translateY(-50%)')
    // Shorter than the 44px link: a pill, not a circle.
    expect(pill['height']).toBe('calc(1.4em + 0.25rem + 2px)')
    expect(pill['pointer-events']).toBe('none')
  })

  it('the podium row still reserves 44px so the hit area is not clipped', () => {
    expect(rule('.race-podium__club')['min-height']).toBe('44px')
  })
})
