/**
 * Focus-ring contrast audit (#1106, re-pointed by #2080).
 *
 * The focus affordance at ~20 sites is `box-shadow: 0 0 0 2px var(--…)`.
 * #1106 gave it a darkened amber so it cleared WCAG 1.4.11's 3:1 non-text
 * floor on light surfaces. #2080 (Ron, 2026-10-15) retires the amber until
 * the Phase 2 re-skin: the ring is now `--focus-ring`, the app's existing
 * focus colour `--link` (loyal blue #004165 light, #60a5d8 dark) — the same
 * colour the `outline: 2px solid var(--link)` rings elsewhere already use.
 *
 * Reads the actual CSS, resolves the token through both `:root` (light) and
 * `[data-theme='dark']`, and checks the ratio on every surface a ring lands
 * on. Falsifiable: point --focus-ring at the bright amber #d4873f and the
 * light cases drop below 3:1.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const tokensCss = stripComments(
  readFileSync(resolve(stylesDir, 'tokens/redesign.css'), 'utf8')
)
const appShellRaw = readFileSync(
  resolve(stylesDir, 'components/app-shell.css'),
  'utf8'
)
const sparklineRaw = readFileSync(
  resolve(stylesDir, 'components/chart-sparkline-expand.css'),
  'utf8'
)

/** Declarations from the first block whose selector matches exactly. */
function parseTokenBlock(
  css: string,
  selectorLiteral: string
): Map<string, string> {
  const re = new RegExp(
    '(?:^|\\n)\\s*' +
      selectorLiteral.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{'
  )
  const m = re.exec(css)
  if (!m) throw new Error(`block ${selectorLiteral} not found`)
  const open = css.indexOf('{', m.index)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const map = new Map<string, string>()
  for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(d[1].trim(), d[2].trim())
  }
  return map
}

const lightTokens = parseTokenBlock(tokensCss, ':root')
const darkTokens = parseTokenBlock(tokensCss, "[data-theme='dark']")

/** Resolve a token / var() chain to a hex string in the requested theme. */
function resolve_(value: string, dark: boolean, depth = 0): string {
  if (depth > 8) throw new Error(`var() resolution too deep: ${value}`)
  const v = value.trim()
  // Strip an optional fallback: var(--x, #hex) → resolve --x, ignore fallback.
  const varMatch = v.match(/^var\((--[\w-]+)(?:\s*,[^)]*)?\)$/)
  if (varMatch) {
    const name = varMatch[1]
    const next = dark
      ? (darkTokens.get(name) ?? lightTokens.get(name))
      : lightTokens.get(name)
    if (!next) throw new Error(`token ${name} undefined`)
    return resolve_(next, dark, depth + 1)
  }
  return v
}

// Surfaces a focus ring actually lands on (lesson 112 — audit EVERY surface a
// token lands on, not just the canonical one). The same surface tokens carry
// both themes; resolve_(…, dark) maps each to the right per-theme value.
const SURFACES = ['var(--surface)', 'var(--surface-2)', 'var(--surface-3)']

describe('Focus-ring contrast (#1106, #2080)', () => {
  for (const [theme, dark] of [
    ['LIGHT', false],
    ['DARK', true],
  ] as const) {
    it(`--focus-ring clears WCAG 1.4.11 (3:1) on every ${theme} surface`, () => {
      const ring = resolve_('var(--focus-ring)', dark)
      for (const s of SURFACES) {
        const surface = resolve_(s, dark)
        const ratio = calculateContrastRatio(ring, surface)
        expect(
          ratio,
          `ring ${ring} on ${s} (${surface}) = ${ratio.toFixed(2)}:1 (need 3:1)`
        ).toBeGreaterThanOrEqual(3)
      }
    })
  }

  it('is the app focus colour (--link) in both themes, not the amber', () => {
    for (const dark of [false, true]) {
      expect(resolve_('var(--focus-ring)', dark)).toBe(
        resolve_('var(--link)', dark)
      )
    }
    // Falsifiability: the retired bright amber fails 3:1 on white.
    expect(calculateContrastRatio('#d4873f', '#ffffff')).toBeLessThan(3)
  })

  it('every box-shadow focus ring uses --focus-ring', () => {
    const ringDecl = /box-shadow:\s*0 0 0 2px var\((--[\w-]+)/g
    const offenders: string[] = []
    for (const [name, css] of [
      ['app-shell.css', appShellRaw],
      ['chart-sparkline-expand.css', sparklineRaw],
    ] as const) {
      for (const m of css.matchAll(ringDecl)) {
        if (m[1] !== '--focus-ring') offenders.push(`${name}: ${m[1]}`)
      }
    }
    expect(offenders, offenders.join('; ')).toEqual([])
  })
})
