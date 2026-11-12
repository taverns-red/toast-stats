/**
 * Visible keyboard focus (#2632, WCAG 2.4.7 / 1.4.11).
 *
 * The 2026-11-12 UX review found focus rings that vanish: a white outline on
 * a white panel (primary buttons), `--loyal-600` outlines that have no dark
 * remap (navy on navy), an InfoTooltip trigger with its outline removed and
 * no replacement, and a hero link with no focus style at all.
 *
 * Static checks on the CSS and component source, plus a contrast check that
 * resolves the ring colour in both themes. Falsifiable: reintroduce
 * `outline: 2px solid var(--tm-white)` on `.tm-btn-primary:focus-visible`.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { calculateContrastRatio } from '../../utils/contrastCalculator'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../..')
const stylesDir = resolve(srcDir, 'styles')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return cssFiles(p)
    return p.endsWith('.css') ? [p] : []
  })
}

const read = (p: string) => stripComments(readFileSync(p, 'utf8'))

const tokensCss = read(resolve(stylesDir, 'tokens/redesign.css'))

function parseBlock(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  if (start < 0) throw new Error(`block ${selector} not found`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const map = new Map<string, string>()
  for (const d of css
    .slice(open + 1, close)
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(d[1].trim(), d[2].trim())
  }
  return map
}

const light = parseBlock(tokensCss, ':root')
const dark = parseBlock(tokensCss, "[data-theme='dark']")

function resolveColor(value: string, isDark: boolean, depth = 0): string {
  if (depth > 8) throw new Error(`too deep: ${value}`)
  const m = value.trim().match(/^var\((--[\w-]+)(?:\s*,[^)]*)?\)$/)
  if (!m) return value.trim()
  const next = isDark ? (dark.get(m[1]) ?? light.get(m[1])) : light.get(m[1])
  if (!next) throw new Error(`token ${m[1]} undefined in tokens/redesign.css`)
  return resolveColor(next, isDark, depth + 1)
}

/** Body of the first rule whose selector list contains `selector`. */
function ruleBody(css: string, selector: string): string | null {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*(?:,[^{]*)?\\{([^}]*)\\}'
  )
  return re.exec(css)?.[1] ?? null
}

describe('visible focus rings (#2632)', () => {
  it('no stylesheet draws an outline in --loyal-600; buttons.css none in --tm-white', () => {
    const offenders: string[] = []
    for (const file of cssFiles(stylesDir)) {
      const css = read(file)
      // --tm-white rings are right on the blue nav bar (navigation.css) but
      // invisible on the white panels primary buttons sit on.
      const banned = file.endsWith('buttons.css')
        ? /outline(?:-color)?:[^;}]*var\((--loyal-600|--tm-white)\)/g
        : /outline(?:-color)?:[^;}]*var\((--loyal-600)\)/g
      for (const m of css.matchAll(banned)) {
        offenders.push(`${file.replace(srcDir, 'src')}: ${m[0]}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('ui/Button primary has no white focus outline', () => {
    const src = readFileSync(
      resolve(srcDir, 'components/ui/Button/Button.tsx'),
      'utf8'
    )
    expect(src).not.toMatch(/outline-white/)
  })

  for (const sel of [
    '.tm-btn-primary:focus-visible',
    '.tm-button-primary:focus-visible',
  ]) {
    for (const [theme, isDark] of [
      ['light', false],
      ['dark', true],
    ] as const) {
      it(`${sel} ring is --focus-ring and clears 3:1 on the ${theme} surface`, () => {
        const body = ruleBody(
          read(resolve(stylesDir, 'components/buttons.css')),
          sel
        )
        expect(body, `${sel} rule missing`).not.toBeNull()
        const color = /outline:\s*\S+\s+\S+\s+(var\([^)]+\))/.exec(body!)?.[1]
        expect(color).toBe('var(--focus-ring)')
        const ratio = calculateContrastRatio(
          resolveColor(color!, isDark),
          resolveColor('var(--surface)', isDark)
        )
        expect(ratio).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it('the club hero history link has a white focus-visible outline', () => {
    const css = read(resolve(stylesDir, 'components/club-history.css'))
    const body = ruleBody(css, '.club-hero__history-link:focus-visible')
    expect(body, 'focus-visible rule missing').not.toBeNull()
    expect(body).toMatch(/outline:\s*2px solid #ffffff/)
  })

  it('InfoTooltip trigger keeps a visible focus indicator', () => {
    const src = readFileSync(
      resolve(srcDir, 'components/InfoTooltip.tsx'),
      'utf8'
    )
    const cls = /className="([^"]*)"\s*\n\s*onMouseEnter/.exec(src)?.[1] ?? ''
    expect(cls).not.toMatch(/focus:outline-hidden/)
    expect(cls).toMatch(/focus-visible:(outline|ring)/)
  })
})
