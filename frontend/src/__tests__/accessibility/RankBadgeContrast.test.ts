/**
 * Medal-circle contrast for the rankings rank badge (#1363, AC "≥4.5:1 on the
 * three medal circles in both themes"), on the legacy palette per #2689 (M1:
 * "rank badges drop the raw yellows").
 *
 * The badge text is 14px bold, NOT WCAG "large text" (≥18.66px bold), so the
 * 4.5:1 normal-text threshold applies; the medal ring is a graphical object
 * and needs 3:1 against the surface (WCAG 1.4.11).
 *
 * The badge uses only tokens (`--tm-loyal-blue`, `--tm-true-maroon`, `--ink`,
 * `--surface`), each of which remaps for `[data-theme='dark']`, so there is no
 * per-theme ink pin any more (the old gold/bronze pin existed only because raw
 * yellow/amber fills do not remap). This test reads the real CSS rules and the
 * real token values, so changing a pairing or a token goes red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string): string => readFileSync(resolve(here, rel), 'utf8')

const appShellCss = read('../../styles/components/app-shell.css')
const colorsCss = read('../../styles/tokens/colors.css')
const redesignCss = read('../../styles/tokens/redesign.css')
const darkModeCss = read('../../styles/dark-mode.css')

type Theme = 'light' | 'dark'

/** A token's value in a theme, read from the stylesheet that declares it.
 *  redesign.css declares the light value first and the dark value in its
 *  `[data-theme='dark']` block after it, so the last declaration is the dark
 *  one. */
const token = (name: string, theme: Theme): string => {
  const re = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'g')
  const all = (text: string): string[] =>
    Array.from(text.matchAll(re), m => m[1]!)
  const redesign = all(redesignCss)
  const found =
    theme === 'light'
      ? [...all(colorsCss), ...redesign.slice(0, 1)]
      : [...all(darkModeCss), ...redesign.slice(-1)]
  const value = found[0]
  if (!value) throw new Error(`token ${name} not found for ${theme}`)
  return value
}

/** The declarations of the `.rank-badge` rule matching `selector`. */
const rule = (selector: string): string => {
  const at = appShellCss.indexOf(`${selector} {`)
  if (at < 0) throw new Error(`rule ${selector} not found in app-shell.css`)
  return appShellCss.slice(at, appShellCss.indexOf('}', at))
}

const TEXT_AA = 4.5
const GRAPHIC_AA = 3

const themes: Theme[] = ['light', 'dark']

describe('rank badge medal circles - contrast (#1363, #2689)', () => {
  it('draws only from legacy tokens: no raw yellow or amber fill', () => {
    const medal = [
      rule('.rank-badge--medal'),
      rule(".rank-badge[data-medal='gold']"),
      rule(".rank-badge[data-medal='bronze']"),
    ].join('\n')
    expect(medal).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(medal).not.toMatch(/yellow|amber/i)
  })

  it('gold is surface ink on a loyal-blue fill, at >=4.5:1 in both themes', () => {
    const gold = rule(".rank-badge[data-medal='gold']")
    expect(gold).toMatch(/background-color:\s*var\(--tm-loyal-blue\)/)
    expect(gold).toMatch(/color:\s*var\(--surface\)/)
    for (const theme of themes) {
      const ratio = calculateContrastRatio(
        token('--surface', theme),
        token('--tm-loyal-blue', theme)
      )
      expect(ratio, `${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        TEXT_AA
      )
    }
  })

  it('silver and bronze are ink on the surface, at >=4.5:1 in both themes', () => {
    expect(rule('.rank-badge--medal')).toMatch(
      /background-color:\s*var\(--surface\)/
    )
    expect(rule('.rank-badge')).toMatch(/color:\s*var\(--ink\)/)
    for (const theme of themes) {
      const ratio = calculateContrastRatio(
        token('--ink', theme),
        token('--surface', theme)
      )
      expect(ratio, `${theme}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        TEXT_AA
      )
    }
  })

  it('the rings (loyal blue, true maroon) clear 3:1 against the surface', () => {
    expect(rule('.rank-badge--medal')).toMatch(
      /border:\s*2px solid var\(--tm-loyal-blue\)/
    )
    expect(rule(".rank-badge[data-medal='bronze']")).toMatch(
      /border-color:\s*var\(--tm-true-maroon\)/
    )
    for (const theme of themes) {
      for (const ring of ['--tm-loyal-blue', '--tm-true-maroon']) {
        const ratio = calculateContrastRatio(
          token(ring, theme),
          token('--surface', theme)
        )
        expect(
          ratio,
          `${ring} ${theme}: ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(GRAPHIC_AA)
      }
    }
  })
})
