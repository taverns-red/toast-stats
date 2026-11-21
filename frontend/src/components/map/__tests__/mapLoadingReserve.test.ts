import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { estimateLegendLabels, legendSlotHeight } from '../legendSlot'
import { buildModeModel } from '../pinModes'

/* The district map's loading reserve. The legend chips and the club lists
   arrive after the first paint, so the panel reserves their room from the
   first render. The real pixels are measured by the CLS smoke
   (e2e/loading-shells-cls.smoke.ts, /district/U/map at 375/768/1280); these
   tests pin the rules that smoke depends on. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(__dirname, '../districtMap.css'), 'utf-8')

describe('legendSlotHeight', () => {
  it('holds one 44px row for chips that share a line', () => {
    expect(legendSlotHeight(['Yes', 'No'])).toBe(44)
    expect(legendSlotHeight(['Yes'])).toBe(44)
  })

  it('puts a long label like "Intervention required" on a row of its own', () => {
    // Thriving (148px) and Vulnerable (164px) do not fit one 280px line.
    expect(
      legendSlotHeight(['Thriving', 'Vulnerable', 'Intervention required'])
    ).toBe(148)
  })

  it('reserves one row when there are no chips yet', () => {
    expect(legendSlotHeight([])).toBe(44)
  })

  it('sizes a mode whose categories are mostly empty from the chips shown', () => {
    // Eight categories, two with clubs: the slot follows the two chips.
    expect(legendSlotHeight(['Coach assigned', 'None'])).toBe(96)
    expect(legendSlotHeight(['A', 'B'])).toBe(44)
  })

  it('stops at four rows so a long legend does not reserve a screen', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Division ${i}`)
    expect(legendSlotHeight(many)).toBe(4 * 44 + 3 * 8)
  })
})

describe('estimateLegendLabels', () => {
  it('leaves out the shared suspended state, as legendChips hides it at zero', () => {
    expect(estimateLegendLabels(buildModeModel('health'))).toEqual([
      'Thriving',
      'Vulnerable',
      'Intervention required',
    ])
  })
})

describe('districtMap.css reserve', () => {
  it('sizes the chips slot from its own custom property', () => {
    expect(css).toMatch(
      /\.map-legend__slot\s*\{[^}]*min-height:\s*var\(--legend-slot\)/
    )
  })

  it('makes the whole fixed panel one scroller, so nothing spills its border', () => {
    expect(css).toMatch(/\.map-panel--fixed\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('never shrinks the lists, so a tall legend or summary cannot crush them', () => {
    const lists = css.match(/\.map-panel__lists\s*\{[^}]*\}/)?.[0] ?? ''
    expect(lists).toMatch(/flex:\s*1 0 auto/)
    expect(lists).not.toMatch(/min-height:\s*0/)
    expect(lists).not.toMatch(/overflow/)
  })
})
