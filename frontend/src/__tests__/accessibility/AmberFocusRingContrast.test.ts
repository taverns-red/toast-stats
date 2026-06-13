/**
 * Amber focus-ring contrast audit (#1106).
 *
 * The product accent `--rt-stats` (#D4873F, amber) was the sole focus
 * affordance at ~10 sites via the pattern
 * `outline: none; box-shadow: 0 0 0 2px var(--rt-stats)`
 * (chart-sparkline-expand.css + app-shell.css). On the LIGHT surfaces these
 * controls sit on, that amber measures only 2.86:1 against white — below
 * WCAG 1.4.11's 3:1 non-text-contrast minimum for a focus indicator. Dark
 * mode already passes (amber on the dark surfaces is 5.5–6.2:1).
 *
 * The fix introduces a focus-specific, theme-aware token `--rt-stats-focus`
 * (local — redesign.css, NOT the brand tokens file rt-brand-v1.css): a
 * darkened amber `#b5651d` in light mode that clears 3:1 on every light
 * surface the ring lands on, remapped back to the bright brand amber in dark
 * mode where it already passes (lesson 093/094 — the token must remap with
 * the surface). All focus-ring sites switch from `var(--rt-stats)` to
 * `var(--rt-stats-focus)`; the brand accent's non-focus uses (404 numerals,
 * checkbox accent-color, hover borders) are untouched.
 *
 * Like the other Track-D audits (ThemeToggleContrast etc.) this reads the
 * *actual* CSS source, resolves the token through both `:root` (light) and
 * `[data-theme='dark']` maps, and checks the ratio against each surface. It
 * is falsifiable: revert `--rt-stats-focus` to the bright amber and the light
 * cases drop below 3:1 (asserted explicitly below).
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
// The brand tokens (--rt-stats etc.) live in their own file; the dark focus
// ring remaps to --rt-stats, so we must resolve it from there — NOT lean on the
// inline `var(--rt-stats, #d4873f)` fallback, which would be undefined-token
// theatre (lesson 132). --rt-* are theme-independent (`:root` only).
const brandCss = stripComments(
  readFileSync(resolve(stylesDir, 'tokens/rt-brand-v1.css'), 'utf8')
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

const brandTokens = parseTokenBlock(brandCss, ':root')
// Brand `:root` is the theme-independent base under both light and dark.
const lightTokens = new Map([
  ...brandTokens,
  ...parseTokenBlock(tokensCss, ':root'),
])
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

// Surfaces a focus ring actually lands on, per theme (lesson 112 — audit
// EVERY surface a token lands on, not just the canonical one).
const LIGHT_SURFACES = [
  'var(--surface)',
  'var(--surface-2)',
  'var(--surface-3)',
]
const DARK_SURFACES = ['var(--surface)', 'var(--surface-2)', 'var(--surface-3)']

describe('Amber focus-ring contrast (#1106)', () => {
  it('--rt-stats-focus clears WCAG 1.4.11 (3:1) on every LIGHT surface', () => {
    const ring = resolve_('var(--rt-stats-focus)', false)
    for (const s of LIGHT_SURFACES) {
      const surface = resolve_(s, false)
      const ratio = calculateContrastRatio(ring, surface)
      expect(
        ratio,
        `ring ${ring} on ${s} (${surface}) = ${ratio.toFixed(2)}:1 (need 3:1)`
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('--rt-stats-focus clears WCAG 1.4.11 (3:1) on every DARK surface', () => {
    const ring = resolve_('var(--rt-stats-focus)', true)
    for (const s of DARK_SURFACES) {
      const surface = resolve_(s, true)
      const ratio = calculateContrastRatio(ring, surface)
      expect(
        ratio,
        `ring ${ring} on ${s} (${surface}) = ${ratio.toFixed(2)}:1 (need 3:1)`
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('falsifiability: the bright brand amber #d4873f would FAIL on white', () => {
    // Documents the bug the fix cures — proves the 3:1 bar is meaningful.
    const ratio = calculateContrastRatio('#d4873f', '#ffffff')
    expect(ratio).toBeLessThan(3)
    // ...and the light focus token must NOT be that failing value.
    const lightRing = resolve_('var(--rt-stats-focus)', false).toLowerCase()
    expect(['#d4873f', '#d4873e']).not.toContain(lightRing)
  })

  it('every amber focus-ring site uses --rt-stats-focus, not bare --rt-stats', () => {
    // The focus affordance is `box-shadow: 0 0 0 2px var(--…)`; a focus
    // border-color paired with it counts too. None may still resolve to the
    // bare brand accent (which fails 3:1 in light mode).
    const ringDecl = /box-shadow:\s*0 0 0 2px var\(--rt-stats(?!-focus)[,)]/g
    const offenders: string[] = []
    for (const [name, css] of [
      ['app-shell.css', appShellRaw],
      ['chart-sparkline-expand.css', sparklineRaw],
    ] as const) {
      const matches = css.match(ringDecl)
      if (matches) offenders.push(`${name}: ${matches.length} site(s)`)
    }
    expect(
      offenders,
      `focus rings still on the bare brand amber: ${offenders.join('; ')}`
    ).toEqual([])

    // And the focused-input border-color must also use the focus token.
    expect(appShellRaw).not.toMatch(
      /:focus\s*\{[^}]*border-color:\s*var\(--rt-stats(?!-focus)[,)]/
    )
  })
})
