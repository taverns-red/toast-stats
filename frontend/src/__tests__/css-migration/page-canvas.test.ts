/**
 * Page canvas contract (#1662)
 *
 * The html/body canvas shows through in overscroll (rubber-band) areas, on
 * short pages and behind anything that overflows the app shell. It used to
 * be `var(--tm-black)`: black in light mode and, because dark-mode.css
 * remaps --tm-black to #f0ecf5, near-white behind html in dark mode. The
 * canvas must be the theme's own page background (--bg, the token the app
 * shell paints with) in both themes, and the UA colour-scheme must follow
 * the app's [data-theme], not the OS preference.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const FRONTEND_SRC = resolve(__dirname, '../..')
const FRONTEND_ROOT = resolve(__dirname, '../../..')

const read = (p: string) => readFileSync(resolve(FRONTEND_SRC, p), 'utf-8')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Bodies of every top-level rule whose selector list exactly matches. */
function ruleBodies(css: string, selector: RegExp): string[] {
  const bodies: string[] = []
  const re = /([^{}@;]+?)\s*\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripComments(css))) !== null) {
    if (selector.test(m[1].trim())) bodies.push(m[2])
  }
  return bodies
}

function decl(body: string, prop: string): string | undefined {
  const m = body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`))
  return m?.[1].trim()
}

describe('Page canvas follows the app theme (#1662)', () => {
  const indexCss = read('index.css')
  const darkCss = read('styles/dark-mode.css')
  const redesign = stripComments(read('styles/tokens/redesign.css'))

  it('defines --bg for both [data-theme] values', () => {
    expect(redesign).toMatch(/:root\s*\{[^}]*--bg:\s*#[0-9a-f]{6}/i)
    expect(redesign).toMatch(
      /\[data-theme='dark'\]\s*\{[^}]*--bg:\s*#[0-9a-f]{6}/i
    )
  })

  it(':root paints the canvas with var(--bg) and ink text', () => {
    const roots = ruleBodies(indexCss, /^:root$/)
    const withBg = roots.filter(b => decl(b, 'background-color'))
    expect(withBg.length).toBeGreaterThan(0)
    for (const b of withBg) {
      expect(decl(b, 'background-color')).toBe('var(--bg)')
    }
    for (const b of roots.filter(r => decl(r, 'color'))) {
      expect(decl(b, 'color')).toBe('var(--ink)')
    }
  })

  it('every body rule in index.css uses var(--bg) and ink text', () => {
    const bodies = ruleBodies(indexCss, /^body$/)
    const withBg = bodies.filter(b => decl(b, 'background-color'))
    expect(withBg.length).toBeGreaterThan(0)
    for (const b of withBg) {
      expect(decl(b, 'background-color')).toBe('var(--bg)')
    }
    for (const b of bodies.filter(r => decl(r, 'color'))) {
      expect(decl(b, 'color')).toBe('var(--ink)')
    }
  })

  it('no html/body/:root canvas uses the remapped --tm-black', () => {
    for (const css of [indexCss, darkCss]) {
      const canvas = ruleBodies(
        css,
        /^(:root|html|body|\[data-theme='dark'\] body|html\[data-theme\] body)$/
      )
      for (const b of canvas) {
        expect(decl(b, 'background-color') ?? '').not.toMatch(/tm-black/)
        expect(decl(b, 'background') ?? '').not.toMatch(/tm-black/)
      }
    }
  })

  it('the dark body override paints var(--bg), matching the app shell', () => {
    const dark = ruleBodies(darkCss, /^\[data-theme='dark'\] body$/)
    for (const b of dark.filter(r => decl(r, 'background-color'))) {
      expect(decl(b, 'background-color')).toBe('var(--bg)')
    }
  })

  it('UA color-scheme follows [data-theme], not the OS preference', () => {
    const all = stripComments(indexCss)
    expect(all).not.toMatch(/color-scheme:\s*light\s+dark/)
    const roots = ruleBodies(indexCss, /^:root$/)
    expect(roots.some(b => decl(b, 'color-scheme') === 'light')).toBe(true)
    const dark = ruleBodies(indexCss, /^:root\[data-theme='dark'\]$/)
    expect(dark.some(b => decl(b, 'color-scheme') === 'dark')).toBe(true)
  })
})

describe('Theme is applied before first paint (#1662)', () => {
  const html = readFileSync(resolve(FRONTEND_ROOT, 'index.html'), 'utf-8')
  const head = html.slice(0, html.indexOf('</head>'))
  const scripts = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    m => m[1]
  )
  const init = scripts.find(s => /data-theme/.test(s))

  it('index.html <head> has an inline theme-init script', () => {
    expect(init).toBeDefined()
  })

  it('reads the persisted theme and falls back to prefers-color-scheme', () => {
    expect(init).toMatch(/localStorage\.getItem\(\s*'theme'\s*\)/)
    expect(init).toMatch(/prefers-color-scheme:\s*dark/)
    expect(init).toMatch(/setAttribute\(\s*'data-theme'/)
  })

  it('guards storage access so a blocked store cannot throw (#1646)', () => {
    expect(init).toMatch(/try\s*\{/)
    expect(init).toMatch(/catch/)
  })
})
