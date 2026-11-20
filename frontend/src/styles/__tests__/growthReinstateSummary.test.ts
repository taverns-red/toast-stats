import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/* #3100 (S8) — the folded "Doesn't add to the club base" summary is body
   text, so it is 16px on phones like the rest of the growth section. jsdom
   cannot compute cascaded styles from this file, so this pins the rule: a
   phone media block, AFTER the base summary rule (same specificity, so
   source order decides), that sets it to 1rem. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(__dirname, '../components/growth.css'),
  'utf-8'
)

describe('growth.css Can reinstate summary (#3100)', () => {
  it('is 16px on phones, after its base rule', () => {
    const base = css.indexOf('.growth-reinstate__summary {')
    expect(base).toBeGreaterThan(-1)
    const phone = [
      ...css.matchAll(/@media \(max-width: 639px\) \{([\s\S]*?)\n\}/g),
    ].filter(
      m =>
        m.index! > base &&
        /\.growth-reinstate__summary[^{]*\{[^}]*font-size:\s*1rem/.test(m[1]!)
    )
    expect(phone).toHaveLength(1)
  })
})
