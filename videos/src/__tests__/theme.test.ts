import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEME } from '../theme'

// Resolve from this file, not process.cwd() (Lesson 082).
const frontendTokens = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'frontend',
  'src',
  'styles',
  'tokens'
)

/** The light-theme (first, `:root`) declaration of a custom property. */
function lightToken(file: string, name: string): string {
  const css = readFileSync(join(frontendTokens, file), 'utf8')
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css)
  if (!match?.[1]) throw new Error(`${name} not found in ${file}`)
  return match[1].trim().toLowerCase()
}

describe('video theme', () => {
  it('takes the legacy palette from the app tokens (#2080)', () => {
    expect(THEME.accent).toBe(lightToken('colors.css', '--tm-loyal-blue'))
    expect(THEME.ink).toBe(lightToken('redesign.css', '--ink'))
    expect(THEME.ink2).toBe(lightToken('redesign.css', '--ink-2'))
    expect(THEME.ink3).toBe(lightToken('redesign.css', '--ink-3'))
    expect(THEME.surface).toBe(lightToken('redesign.css', '--surface'))
    expect(THEME.surface2).toBe(lightToken('redesign.css', '--surface-2'))
    expect(THEME.line).toBe(lightToken('redesign.css', '--line'))
  })

  it('uses no product accent or amber until Phase 2', () => {
    const values = JSON.stringify(THEME).toLowerCase()
    expect(values).not.toContain('rt-stats')
    expect(values).not.toContain('#d4873f')
  })

  it('uses the app fonts', () => {
    expect(THEME.fontBody).toMatch(/^'Inter'/)
    expect(THEME.fontDisplay).toMatch(/^'Montserrat'/)
  })
})
