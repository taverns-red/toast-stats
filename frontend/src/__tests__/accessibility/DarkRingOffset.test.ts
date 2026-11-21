/**
 * Dark-mode focus-ring offset (#3161, follow-up to #2667).
 *
 * Tailwind's `ring-offset-*` utilities draw the gap in `--tw-ring-offset-color`,
 * which defaults to #fff. On a dark page that reads as a white band around the
 * control. Static CSS check: dark-mode.css must remap it, in one rule that
 * targets `ring-offset` elements, to a legacy surface token (R10).
 * Falsifiable: delete the override rule or retarget its selector.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../styles')

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const darkCss = strip(readFileSync(resolve(stylesDir, 'dark-mode.css'), 'utf8'))

/** Every rule that sets --tw-ring-offset-color: its selector and value. */
function offsetRules(css: string): { selector: string; value: string }[] {
  const re = /([^{}]+)\{[^{}]*--tw-ring-offset-color:\s*([^;}]+)/g
  return [...css.matchAll(re)].map(m => ({
    selector: m[1].trim(),
    value: m[2].trim(),
  }))
}

describe('dark focus-ring offset (#3161)', () => {
  const rules = offsetRules(darkCss)

  it('sets --tw-ring-offset-color in exactly one rule', () => {
    expect(rules).toHaveLength(1)
  })

  it('scopes that rule to the dark theme and to ring-offset elements', () => {
    expect(rules[0]?.selector).toMatch(/^\[data-theme=['"]dark['"]\]\s/)
    expect(rules[0]?.selector).toContain('ring-offset')
  })

  it('maps the offset to a legacy surface token', () => {
    expect(rules[0]?.value).toMatch(/^var\(--surface(-[\w-]+)?\)$/)
  })
})
