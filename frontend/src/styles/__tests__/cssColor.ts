/* Shared helpers for stylesheet-level colour tests (#2642).

   jsdom does no cascade, so contrast contracts are pinned on the CSS text:
   read the tokens a theme defines, read the rule a class resolves to, and
   compute the WCAG ratio of the pairing. Not a test file (no *.test.*). */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const srcDir = resolve(here, '../..')

export const stripComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, '')

export const readSrcCss = (rel: string) =>
  stripComments(readFileSync(resolve(srcDir, rel), 'utf-8'))

/** index.css plus every local file reachable through relative @imports. */
export function productionCss(): string {
  const seen = new Set<string>()
  const out: string[] = []
  const visit = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return
    seen.add(file)
    const css = stripComments(readFileSync(file, 'utf-8'))
    out.push(css)
    for (const m of css.matchAll(/@import\s+['"](\.[^'"]+)['"]/g)) {
      visit(resolve(dirname(file), m[1]))
    }
  }
  visit(resolve(srcDir, 'index.css'))
  return out.join('\n')
}

/** Every `selector-entry { declarations }` pair (comma lists split). */
export function rules(css: string): { selector: string; decls: string }[] {
  const out: { selector: string; decls: string }[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].split(';').pop()!.trim()
    if (prelude.startsWith('@')) continue
    for (const s of prelude.split(',')) {
      out.push({ selector: s.trim().replace(/\s+/g, ' '), decls: m[2] })
    }
  }
  return out
}

/** Merged declarations of every rule whose selector entry is exactly `sel`. */
export function declsFor(css: string, sel: string): string {
  return rules(css)
    .filter(r => r.selector === sel)
    .map(r => r.decls)
    .join(';')
}

export function prop(decls: string, name: string): string | undefined {
  const all = [
    ...decls.matchAll(new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`, 'g')),
  ]
  return all.length
    ? all[all.length - 1][1].replace(/!important/, '').trim()
    : undefined
}

export type Rgba = { r: number; g: number; b: number; a: number }
export type Theme = 'light' | 'dark'

/** Custom properties in force for a theme: :root first, then the dark scope. */
export function tokens(theme: Theme): Map<string, string> {
  const map = new Map<string, string>()
  const files = [
    'styles/tokens/colors.css',
    'styles/tokens/redesign.css',
    'styles/dark-mode.css',
  ].map(readSrcCss)
  const scopes =
    theme === 'light' ? [':root'] : [':root', "[data-theme='dark']"]
  for (const scope of scopes) {
    for (const css of files) {
      for (const r of rules(css)) {
        if (r.selector !== scope) continue
        for (const d of r.decls.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g))
          map.set(d[1], d[2].trim())
      }
    }
  }
  return map
}

export function parseColor(
  value: string,
  toks: Map<string, string>,
  depth = 0
): Rgba {
  const v = value.replace(/!important/, '').trim()
  if (depth > 10) throw new Error(`token cycle at ${value}`)
  const ref = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v)
  if (ref) {
    const t = toks.get(ref[1]) ?? ref[2]
    if (!t) throw new Error(`token ${ref[1]} not defined`)
    return parseColor(t, toks, depth + 1)
  }
  const rgba =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v)
  if (rgba)
    return {
      r: +rgba[1],
      g: +rgba[2],
      b: +rgba[3],
      a: rgba[4] === undefined ? 1 : +rgba[4],
    }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const h =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map(c => c + c)
            .join('')
        : hex[1]
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    }
  }
  throw new Error(`unresolvable colour ${value}`)
}

/** `fg` painted over an opaque `bg`. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const mix = (f: number, b: number) => f * fg.a + b * (1 - fg.a)
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 }
}

const lum = (c: Rgba) => {
  const ch = [c.r, c.g, c.b].map(x => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrast(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

/** The page surfaces a component can sit on, per theme. */
export function surfaces(theme: Theme): Rgba[] {
  const t = tokens(theme)
  return ['--bg', '--surface', '--surface-2'].map(k =>
    parseColor(`var(${k})`, t)
  )
}

/** Text of every non-test .ts/.tsx source file under src/. */
export function sourceTexts(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = resolve(dir, name)
      if (name === '__tests__' || name === 'node_modules') continue
      if (statSync(full).isDirectory()) walk(full)
      else if (
        /\.tsx?$/.test(name) &&
        !/\.(test|spec)\.[tj]sx?$/.test(name) &&
        !name.endsWith('.stories.tsx')
      )
        out.push(readFileSync(full, 'utf-8'))
    }
  }
  walk(srcDir)
  return out
}
