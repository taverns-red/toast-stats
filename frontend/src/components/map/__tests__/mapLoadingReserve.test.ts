import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { legendSlotHeight } from '../legendSlot'

/* The district map's loading reserve. The legend chips and the club lists
   arrive after the first paint, so the panel reserves their room from the
   first render. The real pixels are measured by the CLS smoke
   (e2e/loading-shells-cls.smoke.ts, /district/U/map at 375/768/1280); these
   tests pin the rules that smoke depends on. */

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(__dirname, '../districtMap.css'), 'utf-8')

describe('legendSlotHeight', () => {
  it('holds one 44px chip row for one or two chips', () => {
    expect(legendSlotHeight(1)).toBe(44)
    expect(legendSlotHeight(2)).toBe(44)
  })

  it('adds a row, and the 8px gap, for every two further chips', () => {
    expect(legendSlotHeight(3)).toBe(96)
    expect(legendSlotHeight(5)).toBe(148)
  })

  it('stops at three rows so a long legend does not reserve a screen', () => {
    expect(legendSlotHeight(12)).toBe(148)
  })

  it('reserves one row when the model has no categories yet', () => {
    expect(legendSlotHeight(0)).toBe(44)
  })
})

describe('districtMap.css reserve', () => {
  it('sizes the chips slot from its own custom property', () => {
    expect(css).toMatch(
      /\.map-legend__slot\s*\{[^}]*min-height:\s*var\(--legend-slot\)/
    )
  })

  it('keeps the side panel the height of the map box and scrolls the lists', () => {
    expect(css).toMatch(/\.map-panel__lists\s*\{[^}]*overflow-y:\s*auto/)
    expect(css).toMatch(/\.map-panel__lists\s*\{[^}]*flex:\s*1/)
  })
})
