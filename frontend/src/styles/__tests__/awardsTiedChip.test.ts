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
