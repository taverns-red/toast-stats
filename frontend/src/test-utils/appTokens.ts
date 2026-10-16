import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A stylesheet under `frontend/src`, comments stripped. */
export function readCss(pathFromSrc: string): string {
  return readFileSync(resolve(SRC, pathFromSrc), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  )
}

/** The body of the first `:root` or `[data-theme='dark']` block in `css`. */
export function themeBlock(css: string, theme: 'light' | 'dark'): string {
  const selector = theme === 'light' ? ':root' : "[data-theme='dark']"
  const open = css.indexOf('{', css.indexOf(selector))
  return css.slice(open + 1, css.indexOf('}', open))
}

/** A redesign.css token's hex in a theme, upper-cased. */
export function appToken(name: string, theme: 'light' | 'dark'): string {
  const block = themeBlock(readCss('styles/tokens/redesign.css'), theme)
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))
  if (!m) throw new Error(`${name} has no hex in the ${theme} block`)
  return m[1]!.toUpperCase()
}
