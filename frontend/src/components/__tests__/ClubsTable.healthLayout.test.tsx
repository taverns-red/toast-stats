/**
 * Legend spacing and Health marker alignment (#2676, Ron's preview review).
 *
 * jsdom has no layout, so these guard the causes:
 *  - The legend is a flex row; whitespace-only text between flex items and
 *    leading or trailing spaces inside them collapse, which printed
 *    "Intervention·Vulnerable·Thriving.Provisional". Spacing must come from a
 *    column-gap, and the provisional note must be its own element.
 *  - The Thriving tick sat ~13px right of the other markers because the Health
 *    cell was centred (differently wide labels) and the marker had no fixed
 *    box. The cell is start-aligned and the marker is a fixed 1em box.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { HealthLegend } from '../dataTable/cells/HealthLegend'
import { clubColumnTdClass } from '../clubsColumns'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(here, '../../styles/components/data-table.css'),
  'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '')

const ruleBody = (sel: string): string => {
  const m = new RegExp(
    '(?:^|\\n)\\s*' + sel.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}'
  ).exec(css)
  if (!m) throw new Error(`rule ${sel} not found`)
  return m[1]
}

describe('legend spacing (#2676)', () => {
  it('spaces its items with a column-gap, not collapsible whitespace', () => {
    const gap = ruleBody('.dt-legend').match(/column-gap\s*:\s*([\d.]+)px/)
    expect(gap, 'column-gap in px').not.toBeNull()
    expect(Number(gap![1])).toBeGreaterThanOrEqual(6)
  })

  it('makes the provisional note its own element, apart from the Thriving item', () => {
    const { getByTestId } = render(<HealthLegend />)
    const legend = getByTestId('health-legend')
    const note = legend.querySelector('.dt-legend__note')
    expect(note?.textContent).toMatch(/^Provisional:/)
    // The full stop belongs to the Thriving item, a sibling of the note.
    const items = [...legend.querySelectorAll('.dt-legend__item')]
    expect(items.map(i => i.textContent?.trim())).toEqual([
      'Intervention',
      'Vulnerable',
      'Thriving.',
    ])
    expect(note?.parentElement).toBe(legend)
    // Separators are decorative and carry their own spacing via the gap.
    const seps = legend.querySelectorAll('.dt-legend__sep')
    expect(seps.length).toBe(2)
    seps.forEach(s => expect(s.getAttribute('aria-hidden')).toBe('true'))
  })
})

describe('Health marker alignment (#2676)', () => {
  it('gives the marker a fixed 1em box that never shrinks', () => {
    const body = ruleBody('.dt-marker')
    expect(body).toMatch(/width\s*:\s*1em/)
    expect(body).toMatch(/height\s*:\s*1em/)
    expect(body).toMatch(/flex\s*:\s*none/)
  })

  it('start-aligns the Health cell so markers share one edge', () => {
    const cls = clubColumnTdClass('status')
    expect(cls).toContain('text-left')
    expect(cls).not.toContain('text-center')
  })
})
