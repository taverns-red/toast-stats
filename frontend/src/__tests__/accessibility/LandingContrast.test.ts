/**
 * Landing page contrast audit, BOTH themes (#1360).
 *
 * Dark has been guarded for a while — `AwardsDarkModeContrast.test.ts` (#608)
 * and `LandingStaticDarkModeContrast.test.ts` (#611) walk the
 * `[data-theme='dark']` token map. Two gaps let real defects through:
 *
 *  1. **Light was ungated entirely**, on the assumption that a palette authored
 *     for white must pass on white.
 *  2. Both dark audits resolve *semantic* tokens (`--ink-3`, `--loyal-500`).
 *     Neither can see a Tailwind opacity utility (`text-tm-loyal-blue-70`),
 *     because those bake a hardcoded `rgba()` and are overridden by their own
 *     `!important` rules in dark-mode.css rather than by a token (R10).
 *
 * axe-core against the deployed page found four families across that gap:
 *
 *   light  .awards-race-card__status--won  #c9b748 on #ffffff  2.02:1  (11px)
 *   light  .text-tm-loyal-blue-70          #45748f on #e6ecf0  4.23:1  (14px)
 *   light  .text-green-600                 #16a34a on #ffffff  3.29:1  (13px)
 *   dark   .text-tm-loyal-blue-70          #4e8bb7 on #212635  4.10:1  (14px)
 *
 * Like its siblings this reads the *actual* CSS source. axe's `color-contrast`
 * rule is auto-disabled under JSDOM (Lesson 075 — no layout engine, so no
 * computed backdrop), so a mounted test cannot cover this; the structural half
 * of the pair is `DistrictsPage.loaded.axe.test.tsx`. It is falsifiable: revert
 * any one fix and its case fails with the measured ratio.
 *
 * Every backdrop below is *derived* from the source stack rather than pasted
 * from the axe report, and the derivation is itself asserted — so if a card
 * surface moves, this fails loudly instead of measuring a stale colour.
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
const darkModeCss = read('styles/dark-mode.css')
// The legacy Toastmasters brand ramp and the Tailwind palette both live in the
// v4 `@theme` block — that is what emits `text-tm-*-NN` / `text-green-600`.
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

const LIGHT_TOKENS = new Map([
  ...parseTokenBlock(tokensCss, ':root'),
  ...parseTokenBlock(indexCss, '@theme'),
  ...parseTokenBlock(darkModeCss, ':root'),
])
const DARK_TOKENS = new Map([
  ...parseTokenBlock(tokensCss, "[data-theme='dark']"),
  ...parseTokenBlock(darkModeCss, "[data-theme='dark']"),
])

type Theme = 'light' | 'dark'

/** Resolve a token (or `var(--x)` chain) for `theme`. In dark the dark map
 *  wins and falls back to `:root`; in light only `:root` is consulted. */
function resolveVar(value: string, theme: Theme, depth = 0): string {
  if (depth > 8) throw new Error(`var() resolution too deep: ${value}`)
  const v = value.trim()
  const m = v.match(/^var\((--[\w-]+)\)$/)
  if (!m) return v
  const next =
    theme === 'dark'
      ? (DARK_TOKENS.get(m[1]) ?? LIGHT_TOKENS.get(m[1]))
      : LIGHT_TOKENS.get(m[1])
  if (!next) throw new Error(`token ${m[1]} undefined in ${theme}`)
  return resolveVar(next, theme, depth + 1)
}

/** Pull `prop` from the first rule naming `selector` exactly (so `__status`
 *  never matches `__status--won`) that declares it. `!important` is stripped —
 *  it changes the cascade, not the colour. */
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
    const hit = body.match(
      new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;]+);')
    )
    if (hit) return hit[1].replace(/!important/, '').trim()
  }
  throw new Error(`no ${prop} for ${selector}`)
}

const toHex = (c: number[]) =>
  '#' + c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('')

/** Flatten a possibly-translucent colour onto an opaque hex backdrop the way a
 *  browser composites it — which is the colour axe actually measures. Opaque
 *  input passes through unchanged. */
function flatten(color: string, backdropHex: string): string {
  const m = color.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/
  )
  if (!m) return color
  const a = m[4] === undefined ? 1 : Number(m[4])
  const fg = [Number(m[1]), Number(m[2]), Number(m[3])]
  const bd = [1, 3, 5].map(i => parseInt(backdropHex.slice(i, i + 2), 16))
  return toHex(fg.map((c, i) => c * a + bd[i] * (1 - a)))
}

const AA_NORMAL = 4.5

/** Assert `fg` over `bg` clears AA, reporting the measured ratio on failure. */
const expectAA = (label: string, fg: string, bg: string) => {
  const ratio = calculateContrastRatio(fg, bg)
  expect(
    ratio,
    `${label}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (need ${AA_NORMAL}:1)`
  ).toBeGreaterThanOrEqual(AA_NORMAL)
}

describe('Landing page contrast, both themes (#1360)', () => {
  describe('Awards Race status line (11px, on the card --surface)', () => {
    const cases: Array<[Theme, string]> = [
      ['light', '.awards-race-card__status'],
      ['light', '.awards-race-card__status--won'],
      ['dark', '.awards-race-card__status'],
      ['dark', '.awards-race-card__status--won'],
    ]
    it.each(cases)('%s: %s clears WCAG AA', (theme, sel) => {
      const surface = resolveVar('var(--surface)', theme)
      const fg = flatten(
        resolveVar(declFor(appShellCss, sel, 'color'), theme),
        surface
      )
      expectAA(`${theme} ${sel}`, fg, surface)
    })
  })

  describe('Scoring Methodology callout (14px, on a 10% brand tint)', () => {
    // The callout is `bg-tm-loyal-blue-10` inside a `bg-white` card, so the
    // effective backdrop is the flattened tint — NOT the card. Both layers are
    // opacity utilities, and R10's point is that each bakes its own rgba():
    // they do not inherit a `--color-tm-loyal-blue` override, so every rung has
    // to be measured on its own in every theme.
    const backdrop = (theme: Theme) => {
      const card =
        theme === 'dark'
          ? resolveVar(
              declFor(darkModeCss, '.bg-white', 'background-color'),
              theme
            )
          : '#ffffff' // `.bg-white`, untouched in light
      const tint =
        theme === 'dark'
          ? declFor(darkModeCss, '.bg-tm-loyal-blue-10', 'background-color')
          : resolveVar('var(--color-tm-loyal-blue-10)', theme)
      return flatten(tint, card)
    }

    // Pin the derivation: these are the backdrops axe reported, so if a card
    // surface or a tint moves, the ratios below stop being about the real page.
    it.each([
      ['light', '#e6ecf0'],
      ['dark', '#212635'],
    ] as Array<[Theme, string]>)(
      '%s: the tint stack resolves to %s',
      (theme, expected) => expect(backdrop(theme)).toBe(expected)
    )

    const ink = (theme: Theme, rung: 70 | 80) =>
      theme === 'dark'
        ? declFor(darkModeCss, `.text-tm-loyal-blue-${rung}`, 'color')
        : resolveVar(`var(--color-tm-loyal-blue-${rung})`, theme)

    const cases: Array<[Theme, 70 | 80, string]> = [
      ['light', 80, 'lede paragraph'],
      ['light', 70, 'point-allocation + example paragraphs'],
      ['dark', 80, 'lede paragraph'],
      ['dark', 70, 'point-allocation + example paragraphs'],
    ]
    it.each(cases)(
      '%s: text-tm-loyal-blue-%d clears WCAG AA (%s)',
      (theme, rung) => {
        const bg = backdrop(theme)
        expectAA(
          `${theme} text-tm-loyal-blue-${rung}`,
          flatten(ink(theme, rung), bg),
          bg
        )
      }
    )
  })

  describe('Rankings table growth delta (13px, on the white table surface)', () => {
    // `text-green-600` marks a positive club/payment growth percentage.
    //
    // Read the RULE that paints it, not the scale token. Neither theme takes
    // its colour from `--color-green-600` any more: dark-mode.css has always
    // remapped this utility with an `!important` rule, and light now carries an
    // equivalent unlayered override, because green-600 is a fill green that is
    // 3.30:1 on white — illegal as small ink. The Tailwind scale block stays
    // stock so `bg-green-600` / `border-green-600` keep the real value, which
    // is exactly why asserting the token here would measure a colour nothing
    // paints. Deleting either rule makes `declFor` throw rather than pass.
    it.each([['light'], ['dark']] as Array<[Theme]>)(
      '%s: text-green-600 clears WCAG AA',
      theme => {
        const surface =
          theme === 'dark' ? resolveVar('var(--surface)', theme) : '#ffffff'
        const fg = declFor(
          theme === 'dark' ? darkModeCss : indexCss,
          '.text-green-600',
          'color'
        )
        expectAA(`${theme} text-green-600`, flatten(fg, surface), surface)
      }
    )

    // The scale token itself must stay stock Tailwind — the fix is a rule, not
    // a palette edit. This is what makes the override necessary rather than
    // redundant, and it fails if someone "simplifies" by mutating the scale.
    it('leaves the Tailwind green-600 scale token untouched', () => {
      expect(resolveVar('var(--color-green-600)', 'light')).toBe('#16a34a')
    })
  })
})
