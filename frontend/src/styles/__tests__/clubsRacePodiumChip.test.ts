// /clubs podium district chip (#1617)
//
// The "D80" chip beside each podium club is an `a[href]`, so the base layer's
// 44px touch-target floor (`min-height`/`min-width: 44px`, base.css) made it a
// 44px circle under its 999px radius. The chip must render as a compact pill
// while its HIT AREA stays ≥44px: the visual box opts out of the floor, and an
// absolutely positioned ::before restores a 44px target around it. jsdom does
// no layout, so the contract is pinned on the stylesheet itself.

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

describe('/clubs podium district chip (#1617)', () => {
  it('the visible chip opts out of the 44px floor, so it is a pill, not a circle', () => {
    const chip = rule('.race-podium__district')
    expect(chip['min-height']).toBe('0')
    expect(chip['min-width']).toBe('0')
    expect(chip['border-radius']).toBe('999px')
    // Anchors the hit-area pseudo-element to the chip.
    expect(chip['position']).toBe('relative')
  })

  it('keeps a ≥44px hit area centred on the chip', () => {
    const hit = rule('.race-podium__district::before')
    expect(hit['content']).toBe("''")
    expect(hit['position']).toBe('absolute')
    expect(hit['height']).toBe('44px')
    expect(hit['width']).toBe('max(100%, 44px)')
    expect(hit['top']).toBe('50%')
    expect(hit['left']).toBe('50%')
    expect(hit['transform']).toBe('translate(-50%, -50%)')
  })

  it('the podium row still reserves 44px so the hit area is not clipped', () => {
    expect(rule('.race-podium__club')['min-height']).toBe('44px')
  })
})
