/**
 * Shared-chrome contrast on the club page and the footer (#1648).
 *
 * Two light-mode WCAG 2 AA failures survived #1607's /clubs restyle:
 *
 * - `.goal-timeline__note` (the 11px "* nearest available snapshot" note on
 *   `/club/:id`) was `--ink-4` #828b9a on white: 3.43:1, below 4.5:1.
 * - `.app-shell-footer__link` ("Red Taverns" and the other footer links) was
 *   told apart from the surrounding `--ink-3` footer text by colour alone:
 *   #004165 vs #5b6675 is 1.85:1, below the 3:1 that axe
 *   `link-in-text-block` needs when there is no non-colour cue.
 *
 * Both are fixed in CSS (R10): the note takes a token that clears AA in BOTH
 * theme blocks, and the footer link carries an underline in every theme.
 * jsdom does no cascade, so the contract is pinned on the stylesheets.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const readCss = (p: string) =>
  stripComments(readFileSync(resolve(stylesDir, p), 'utf8'))

const tokensCss = readCss('tokens/redesign.css')
const shellCss = readCss('components/app-shell.css')
const darkCss = readCss('dark-mode.css')

function parseBlock(css: string, selector: string): Map<string, string> {
  const re = new RegExp(
    '(?:^|\\n)\\s*' +
      selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{'
  )
  const m = re.exec(css)
  if (!m) throw new Error(`block ${selector} not found`)
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

/** Declarations of every rule whose selector list contains `sel` exactly. */
function declsFor(css: string, sel: string): string {
  const out: string[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map(s => s.trim().replace(/\s+/g, ' '))
    if (selectors.includes(sel)) out.push(m[2])
  }
  return out.join(';')
}

const light = parseBlock(tokensCss, ':root')
const dark = parseBlock(tokensCss, "[data-theme='dark']")

/** The value a `var(--x)` colour resolves to in a theme block. */
function resolveToken(value: string, theme: Map<string, string>): string {
  const m = /^var\((--[\w-]+)\)$/.exec(value.trim())
  if (!m) return value.trim()
  const next = theme.get(m[1]!) ?? light.get(m[1]!)
  if (!next) throw new Error(`unresolved ${m[1]}`)
  return resolveToken(next, theme)
}

function colorOf(sel: string): string {
  const decls = declsFor(shellCss, sel)
  const m = /(?:^|;)\s*color:\s*([^;]+)/.exec(decls)
  if (!m) throw new Error(`no color for ${sel}`)
  return m[1]!.trim()
}

describe('club page timeline note + footer link contrast (#1648)', () => {
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    '.goal-timeline__note clears AA 4.5:1 on --surface in %s mode',
    (_name, theme) => {
      // A dark-mode override of the note, if any, wins over the base colour.
      const darkOverride = /(?:^|;)\s*color:\s*([^;]+)/.exec(
        declsFor(darkCss, "[data-theme='dark'] .goal-timeline__note")
      )
      const raw =
        theme === dark && darkOverride
          ? darkOverride[1]!
          : colorOf('.goal-timeline__note')
      const fg = resolveToken(raw, theme)
      const bg = resolveToken(theme.get('--surface')!, theme)
      const ratio = calculateContrastRatio(fg, bg)
      expect(
        ratio,
        `${fg} on ${bg} = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(4.5)
    }
  )

  it('.app-shell-footer__link carries an underline (non-colour cue) in every theme', () => {
    expect(declsFor(shellCss, '.app-shell-footer__link')).toMatch(
      /text-decoration(-line)?:\s*underline/
    )
    // …and no theme-scoped rule strips it again.
    for (const css of [shellCss, darkCss]) {
      expect(
        declsFor(css, "[data-theme='dark'] .app-shell-footer__link")
      ).not.toMatch(/text-decoration(-line)?:\s*none/)
    }
  })
})
