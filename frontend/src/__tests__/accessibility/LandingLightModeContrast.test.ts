/**
 * Landing page LIGHT-mode contrast audit (#1360).
 *
 * The dark theme has been guarded for a while — `AwardsDarkModeContrast.test.ts`
 * (#608) and `LandingStaticDarkModeContrast.test.ts` (#611) both walk the
 * `[data-theme='dark']` map. Light was ungated on the assumption that the
 * palette was authored for white, and two landing-page defects lived there
 * unnoticed until axe-core was run against the deployed page:
 *
 *   .awards-race-card__status--won  #c9b748 on #ffffff  = 2.02:1  (11px)
 *   .text-tm-loyal-blue-70          #45748f on #e6ecf0  = 4.23:1  (14px)
 *
 * Both are the *mirror* of the trap Lessons 093/094 describe: a token must
 * remap with its surface, and `--yellow-600` is tuned for the dark surface
 * (8.73:1 there) with no light-side counterpart.
 *
 * Like its dark-mode siblings this reads the *actual* CSS source rather than
 * relying on jest-axe, whose `color-contrast` rule is auto-disabled under JSDOM
 * (Lesson 075 — no layout engine, so no computed background). It is falsifiable:
 * revert either fix and the matching case fails with the measured ratio.
 *
 * Lives in `__tests__/accessibility/` so it routes to the integration project
 * (vitest.shared.mjs / Lesson 090). Pure computation, so it's fast.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../..')

// Strip /* … */ so a brace inside prose can't be mistaken for a block close by
// the naive brace scan below.
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (p: string) =>
  stripComments(readFileSync(resolve(srcDir, p), 'utf8'))

const tokensCss = read('styles/tokens/redesign.css')
const appShellCss = read('styles/components/app-shell.css')
// The legacy Toastmasters brand ramp lives in the Tailwind v4 `@theme` block,
// which is what emits the `text-tm-*-NN` / `bg-tm-*-NN` utilities.
const indexCss = read('index.css')

/** Extract the `--name: value;` declarations from the first block whose
 *  selector matches `selectorLiteral` exactly (e.g. `:root`, `@theme`).
 *  Anchored to a real rule start (line start + `{`) so a comment that merely
 *  mentions the selector can't be parsed as the block (Lesson 093). */
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
  const map = new Map<string, string>()
  for (const d of css
    .slice(open + 1, close)
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(d[1].trim(), d[2].trim())
  }
  return map
}

const lightTokens = new Map([
  ...parseTokenBlock(tokensCss, ':root'),
  ...parseTokenBlock(indexCss, '@theme'),
])

/** Resolve a token (or `var(--x)` chain) in LIGHT mode — `:root` only, no
 *  `[data-theme='dark']` map. Returns the literal (`#rrggbb` or `rgba(…)`). */
function resolveLight(value: string, depth = 0): string {
  if (depth > 8) throw new Error(`var() resolution too deep: ${value}`)
  const v = value.trim()
  const varMatch = v.match(/^var\((--[\w-]+)\)$/)
  if (varMatch) {
    const next = lightTokens.get(varMatch[1])
    if (!next) throw new Error(`token ${varMatch[1]} undefined in light mode`)
    return resolveLight(next, depth + 1)
  }
  return v
}

/** Pull `prop` from the first rule naming `selector` exactly (so `__status`
 *  never matches `__status--won`) that declares it. */
function declFor(css: string, selector: string, prop: string): string {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])',
    'g'
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    const open = css.indexOf('{', m.index)
    if (open === -1) continue
    const close = css.indexOf('}', open)
    const body = css.slice(open + 1, close)
    const propMatch = body.match(
      new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;]+);')
    )
    if (propMatch) return propMatch[1].trim()
  }
  throw new Error(`no ${prop} for ${selector}`)
}

const toHex = (c: number[]) =>
  '#' + c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('')

/** Flatten a possibly-translucent colour onto an opaque hex backdrop, the way
 *  a browser composites it — which is the colour axe actually measures.
 *  Opaque input passes through unchanged. */
function flatten(color: string, backdropHex: string): string {
  const rgba = color.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/
  )
  if (!rgba) return color
  const a = rgba[4] === undefined ? 1 : Number(rgba[4])
  const fg = [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])]
  const bd = [1, 3, 5].map(i => parseInt(backdropHex.slice(i, i + 2), 16))
  return toHex(fg.map((c, i) => c * a + bd[i] * (1 - a)))
}

const AA_NORMAL = 4.5

describe('Landing page light-mode contrast (#1360)', () => {
  const surfaceLight = resolveLight('var(--surface)')

  describe('Awards Race status line', () => {
    // Both statuses are 11px normal-weight text on the white card surface.
    it.each([
      ['.awards-race-card__status', 'leader / in-progress'],
      ['.awards-race-card__status--won', 'gold "✓ Achieved" state'],
    ])('%s clears WCAG AA on the light surface (%s)', sel => {
      const fg = flatten(
        resolveLight(declFor(appShellCss, sel, 'color')),
        surfaceLight
      )
      const ratio = calculateContrastRatio(fg, surfaceLight)
      expect(
        ratio,
        `${sel}: ${fg} on ${surfaceLight} = ${ratio.toFixed(2)}:1 (need ${AA_NORMAL}:1)`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    })
  })

  describe('Scoring Methodology callout', () => {
    // The callout is `bg-tm-loyal-blue-10` (a 10% brand tint) inside a
    // `bg-white` card, so the effective backdrop is the flattened tint — NOT
    // white. R10: these `-NN` utilities bake in a hardcoded rgba() and do not
    // inherit a `--color-tm-loyal-blue` override, so each rung has to be
    // measured on its own.
    const CARD = '#ffffff' // `.bg-white` on the enclosing card
    const panel = flatten(resolveLight('var(--color-tm-loyal-blue-10)'), CARD)

    it('the callout tint resolves to the backdrop axe measured', () => {
      expect(panel).toBe('#e6ecf0')
    })

    it.each([
      ['--color-tm-loyal-blue-80', 'lede paragraph'],
      ['--color-tm-loyal-blue-70', 'point-allocation + example paragraphs'],
    ])('text-%s clears WCAG AA on the tint (%s)', token => {
      const fg = flatten(resolveLight(`var(${token})`), panel)
      const ratio = calculateContrastRatio(fg, panel)
      expect(
        ratio,
        `${token}: ${fg} on ${panel} = ${ratio.toFixed(2)}:1 (need ${AA_NORMAL}:1)`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    })
  })
})
