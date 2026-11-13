/**
 * #2652 (LAND-09): the active search row was --surface-2 on --surface, 1.04:1
 * with no outline, so keyboard users could not see which row Enter opens.
 * WCAG 1.4.11 wants >= 3:1 for the indicator, and 1.4.1 wants a cue that is
 * not colour alone. The rule must carry a solid inset bar in a legacy token.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const css = (p: string) => readFileSync(resolve(here, '..', p), 'utf8')

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

function rule(source: string, selector: string): string {
  const re = new RegExp(
    selector.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}',
    'm'
  )
  const m = re.exec(source)
  if (!m) throw new Error(`rule ${selector} not found`)
  return m[1]!
}

describe('search active row indicator (#2652)', () => {
  const active = rule(
    css('components/app-shell.css'),
    '.command-palette__result--active'
  )

  it('has a non-colour cue: a 3px inset bar in --tm-loyal-blue', () => {
    expect(active).toMatch(
      /box-shadow:\s*inset\s+3px\s+0\s+0(?:\s+0)?\s+var\(--tm-loyal-blue\)/
    )
  })

  it('tints with --tm-loyal-blue-10, not the near-white --surface-2', () => {
    expect(active).toMatch(/background-color:\s*var\(--tm-loyal-blue-10\)/)
    expect(active).not.toMatch(/--surface-2/)
  })

  it('the bar reaches 3:1 against the surface in light and dark', () => {
    const light = css('tokens/colors.css').match(
      /--tm-loyal-blue:\s*(#[0-9a-f]{6})/i
    )![1]!
    const dark = css('dark-mode.css').match(
      /--tm-loyal-blue:\s*(#[0-9a-f]{6})/i
    )![1]!
    expect(ratio(light, '#ffffff')).toBeGreaterThanOrEqual(3)
    expect(ratio(dark, '#111922')).toBeGreaterThanOrEqual(3)
  })
})
