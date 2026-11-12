/**
 * Training page lead slots (#2631). jsdom has no layout (Lesson 66), so this
 * pins the CSS contract; the CLS number is proven by
 * e2e/district-subpages-cls.smoke.ts on the preview.
 *
 * The context and region-rank paragraphs arrive after first paint (date
 * index, region rollup). Without a reserved box they pushed the whole page
 * down: CLS 0.115 at 375 against the 0.1 budget. The slots keep a minimum
 * height, taller on phones where the text wraps to about three lines.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(
  join(__dirname, '../styles/components/training.css'),
  'utf-8'
)

const rule = (sel: string, src = css) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return src.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

const phone = (
  css.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\n\}/g) ?? []
).join('\n')

describe('Training page lead slots reserve their space (#2631)', () => {
  it('context slot has a minimum height everywhere and a taller one on phones', () => {
    expect(rule('.training-context--reserve')).toMatch(/min-height:/)
    expect(rule('.training-context--reserve', phone)).toMatch(/min-height:/)
  })

  it('rank slot has a minimum height everywhere and a taller one on phones', () => {
    expect(rule('.training-rank--reserve')).toMatch(/min-height:/)
    expect(rule('.training-rank--reserve', phone)).toMatch(/min-height:/)
  })

  it('a pending context slot paints nothing (no empty blue box)', () => {
    const pending = rule('.training-context--pending')
    expect(pending).toMatch(/background:\s*transparent/)
    expect(pending).toMatch(/border-color:\s*transparent/)
  })
})
