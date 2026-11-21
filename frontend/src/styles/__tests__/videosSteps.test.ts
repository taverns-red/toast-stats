import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* The "Steps shown" disclosure on /videos must keep a visible open/closed
   marker and a 44px tap target. `display: flex` on a <summary> drops the
   marker, so the rule has to keep the native list-item display. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/videos.css'),
  'utf-8'
)

const rule = (selector: string): string => {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return ''
  return css.slice(start, css.indexOf('}', start))
}

describe('/videos steps disclosure', () => {
  const summary = rule('.videos-page__steps summary')

  it('keeps the disclosure marker (no display: flex on the summary)', () => {
    expect(summary).not.toBe('')
    expect(summary).not.toMatch(/display:\s*(flex|inline-flex|grid)/)
  })

  it('keeps a 44px target', () => {
    expect(summary).toMatch(/min-height:\s*44px/)
  })
})
