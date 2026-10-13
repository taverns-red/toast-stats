/**
 * Realignment sandbox area <select> touch-target floor (#1974).
 *
 * In WebKit, a native <select> with `appearance: auto` ignores `min-height`,
 * so `.realign__select` rendered 23 px tall and failed the 44 px floor in
 * the WebKit smoke (Chromium was fine). Opting out of native chrome lets
 * WebKit honour the floor (Lessons 108/111), and the rule then has to supply
 * its own caret, adapted for dark mode.
 *
 * jsdom has no layout (L66), so this reads the stylesheet. The per-engine
 * box is proven by the dual-engine `district-map` smoke.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(here, '../../components/map/realign/realign.css'),
  'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the rule whose selector list is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!m) throw new Error(`rule not found: ${selector}`)
  return m[1]!
}

describe('.realign__select touch target (#1974)', () => {
  const body = ruleBody('.realign__select')

  it('keeps the 44 px floor', () => {
    const m = body.match(/min-height:\s*(\d+)px/)
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(44)
  })

  it('opts out of native chrome so WebKit honours min-height', () => {
    expect(body).toMatch(/(^|[;\s])appearance:\s*none/)
    expect(body).toMatch(/-webkit-appearance:\s*none/)
  })

  it('draws its own caret, with a dark-mode variant', () => {
    expect(body).toMatch(/background-image:\s*url\(/)
    // A `background:` shorthand after it would wipe the caret.
    expect(body).not.toMatch(/(^|[;\s])background:/)
    expect(ruleBody("[data-theme='dark'] .realign__select")).toMatch(
      /background-image:\s*url\(/
    )
  })
})
