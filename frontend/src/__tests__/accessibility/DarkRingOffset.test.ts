/**
 * Dark-mode focus-ring offset (#3161, follow-up to #2667).
 *
 * Tailwind's `ring-offset-*` utilities draw the gap in `--tw-ring-offset-color`,
 * which defaults to #fff. On a dark page that reads as a white band around the
 * control. Static CSS check: the dark theme must remap it to a legacy surface
 * token, once, in dark-mode.css (R10). Falsifiable: delete the override rule.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const darkCss = strip(readFileSync(resolve(stylesDir, 'dark-mode.css'), 'utf8'))

/** Value assigned to --tw-ring-offset-color in a [data-theme='dark'] rule. */
function darkOffset(css: string): string | undefined {
  const re =
    /\[data-theme=['"]dark['"]\][^{}]*\{[^}]*--tw-ring-offset-color:\s*([^;}]+)/
  return re.exec(css)?.[1].trim()
}

describe('dark focus-ring offset (#3161)', () => {
  it('remaps --tw-ring-offset-color under [data-theme=dark] to a legacy surface token', () => {
    const value = darkOffset(darkCss)
    expect(value, 'no dark --tw-ring-offset-color override').toBeDefined()
    expect(value).toMatch(/^var\(--surface(-[\w-]+)?\)$/)
  })
})
