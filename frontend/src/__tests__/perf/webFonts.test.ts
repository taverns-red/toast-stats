/**
 * Self-hosted web fonts (#1905, mobile epic #1827).
 *
 * The Google Fonts chain was the largest single lever left on mobile LCP:
 * four `fonts.googleapis.com` stylesheets (two extra origins, each paying
 * DNS + TCP + TLS) → CSS → woff2 on `fonts.gstatic.com`, discovered only when
 * React rendered text. On `/district/61` the LCP element is a caption whose
 * size changes when Source Sans 3 lands, so district LCP was font arrival
 * time. The contract now:
 *
 * - every family the app loaded from Google is still declared (ops#37 blocks
 *   dropping any), from same-origin woff2 files with Google's own subsets and
 *   unicode-ranges, so nothing is fetched cross-origin;
 * - no font is preloaded. Measured (#1905 PR): preloading the two first-screen
 *   latin files (64 KB) made them compete with the app's JS on the 1.6 Mbps
 *   profile, so real-browser FCP got ~330 ms worse on all three routes. The
 *   first-screen families keep their metric-matched fallbacks, so the swap
 *   cannot move layout (Lesson 81: JetBrains Mono, with no fallback, took
 *   CLS from 0.012 to 0.199);
 * - JetBrains Mono stays undeclared and unpreloaded (Phase 2, ops#37).
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const FRONTEND = resolve(__dirname, '../../..')
const SRC = resolve(FRONTEND, 'src')
const html = readFileSync(resolve(FRONTEND, 'index.html'), 'utf-8')
const WEB_FONTS = resolve(SRC, 'styles/tokens/web-fonts.css')
const webFontsCss = existsSync(WEB_FONTS)
  ? readFileSync(WEB_FONTS, 'utf-8')
  : ''

interface Face {
  family: string
  weight: [number, number]
  url: string
  unicodeRange: string
  display: string
}

function faces(css: string): Face[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
    const body = m[1] ?? ''
    const get = (prop: string) =>
      (body.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1] ?? '').trim()
    const [lo, hi] = get('font-weight').split(/\s+/).map(Number)
    return {
      family: get('font-family').replace(/['"]/g, ''),
      weight: [lo ?? 0, hi ?? lo ?? 0],
      url: body.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1] ?? '',
      unicodeRange: get('unicode-range'),
      display: get('font-display'),
    }
  })
}

const declared = faces(webFontsCss)

/** Families and weights index.html requested from Google before #1905. */
const REQUIRED: Record<string, number[]> = {
  Montserrat: [500, 600, 700, 800, 900],
  'Source Sans 3': [400, 500, 600, 700],
  'Space Grotesk': [400, 500, 600, 700],
  Inter: [400, 500, 600],
}

function allSourceCss(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.css')) out.push([p, readFileSync(p, 'utf-8')])
    }
  }
  walk(SRC)
  return out
}

describe('self-hosted web fonts (#1905)', () => {
  it('index.html no longer loads anything from Google Fonts', () => {
    expect(html).not.toMatch(/fonts\.googleapis\.com/)
    expect(html).not.toMatch(/fonts\.gstatic\.com/)
  })

  it('no stylesheet under src/ fetches from Google Fonts', () => {
    // rt-brand-v1.css is an upstream copy whose @import is commented out.
    const offenders = allSourceCss()
      .filter(([, css]) =>
        css
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .match(/fonts\.(googleapis|gstatic)\.com/)
      )
      .map(([p]) => p)
    expect(offenders).toEqual([])
  })

  it('index.css imports web-fonts.css', () => {
    const indexCss = readFileSync(resolve(SRC, 'index.css'), 'utf-8')
    expect(indexCss).toMatch(
      /@import\s+['"]\.\/styles\/tokens\/web-fonts\.css['"]/
    )
  })

  it.each(Object.entries(REQUIRED))(
    'still declares %s at every weight it was loaded at (ops#37: no family dropped)',
    (family, weights) => {
      const own = declared.filter(f => f.family === family)
      expect(own.length).toBeGreaterThan(0)
      // The latin subset must cover every weight.
      const latin = own.filter(f => /U\+0000-00FF/.test(f.unicodeRange))
      expect(latin).toHaveLength(1)
      const [lo, hi] = latin[0]!.weight
      for (const w of weights) {
        expect(w).toBeGreaterThanOrEqual(lo)
        expect(w).toBeLessThanOrEqual(hi)
      }
    }
  )

  it('every face is swap, unicode-range scoped, and points at a woff2 that exists', () => {
    expect(declared.length).toBeGreaterThan(0)
    for (const f of declared) {
      expect(f.display).toBe('swap')
      expect(f.unicodeRange).not.toBe('')
      expect(f.url).toMatch(/\.woff2$/)
      // Root-absolute (/src/...) so Vite resolves it from any importer.
      expect(f.url).toMatch(/^\/src\/assets\/fonts\//)
      expect(existsSync(resolve(FRONTEND, f.url.slice(1)))).toBe(true)
    }
  })

  it('does not declare JetBrains Mono (deferred to Phase 2 — Lesson 81)', () => {
    expect(declared.some(f => f.family === 'JetBrains Mono')).toBe(false)
    expect(html).not.toMatch(/<link\b[^>]*jetbrains/i)
  })

  describe('preloads', () => {
    const fontPreloads = [
      ...html.matchAll(/<link\b[^>]*\brel="preload"[^>]*>/g),
    ]
      .map(m => m[0])
      .filter(l => /\bas="font"/.test(l))

    it('preloads no font: on the 1.6 Mbps profile a preload delays the JS and FCP', () => {
      expect(fontPreloads).toEqual([])
    })

    it('the first-screen families keep a metric-matched fallback in their stack (Lesson 81)', () => {
      const fallbacks = readFileSync(
        resolve(SRC, 'styles/tokens/font-fallbacks.css'),
        'utf-8'
      )
      const tokens = readFileSync(
        resolve(SRC, 'styles/tokens/redesign.css'),
        'utf-8'
      )
      for (const family of ['Montserrat', 'Source Sans 3']) {
        expect(fallbacks).toContain(`font-family: '${family} Fallback'`)
        expect(tokens).toContain(`'${family}', '${family} Fallback'`)
      }
      expect(fallbacks).toMatch(/size-adjust:/)
    })
  })
})
