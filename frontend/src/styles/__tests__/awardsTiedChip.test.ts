// /awards "tied" chip type floor (#2264)
//
// The chip only renders when an award race has a tie (#1610), so it went
// unmeasured until the 10-23 snapshot produced ties and every PR preview's
// e2e/type-floor.smoke.ts failed: "10px span.awards-page-card__tied". The
// phone floor (mobile-type-floor.css) is 14px, with 12px allowed ONLY for
// uppercase eyebrows/labels. jsdom does no layout, so the contract is pinned
// on the stylesheet; the smoke measures the rendered text.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(
  resolve(__dirname, '../components/app-shell.css'),
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

describe('/awards tied chip (#2264)', () => {
  const chip = rule('.awards-page-card__tied')
  const px = Number(/^(\d+(?:\.\d+)?)px$/.exec(chip['font-size'] ?? '')?.[1])

  it('has a px font size of at least 12px', () => {
    expect(Number.isFinite(px), `font-size: ${chip['font-size']}`).toBe(true)
    expect(px).toBeGreaterThanOrEqual(12)
  })

  it('is uppercase when under the 14px floor (eyebrow exception)', () => {
    if (px < 14) expect(chip['text-transform']).toBe('uppercase')
  })

  it('stays on one line so it cannot break inside the row', () => {
    expect(chip['white-space']).toBe('nowrap')
  })
})

// The 375 gate (e2e/mobile-375-gate.smoke.ts) also ratchets the share of
// characters under 14px. The tie-note and chip only appear when there are ties,
// and at 12px they pushed /awards to 7.2% against a 5% budget. On phones both
// join the Awards group of the 14px floor in mobile-type-floor.css.
describe('/awards tie labels on the phone 14px floor (#2264)', () => {
  const floor = readFileSync(
    resolve(__dirname, '../mobile-type-floor.css'),
    'utf-8'
  ).replace(/\/\*[\s\S]*?\*\//g, '')

  /** The selector list of the rule that sizes `.awards-page-card__row`. */
  const block = /([^{}]*\.awards-page-card__row,[^{}]*)\{([^}]*)\}/.exec(floor)

  it('the Awards group is set to 14px', () => {
    expect(block, 'awards rule in mobile-type-floor.css').not.toBeNull()
    expect(block![2]).toMatch(/font-size:\s*14px/)
  })

  it.each(['.awards-page-card__tie-note', '.awards-page-card__tied'])(
    '%s is in the 14px group',
    sel => {
      const selectors = block![1].split(',').map(s => s.trim())
      expect(selectors).toContain(sel)
    }
  )
})
