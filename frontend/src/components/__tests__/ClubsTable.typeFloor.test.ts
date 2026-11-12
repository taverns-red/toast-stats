/**
 * Clubs table type floor (#2676, spec §12 test 8; Ron 2026-11-12, D3).
 *
 * Data text is 14px at the least and table headers are 14px sentence case; 12px
 * is the absolute minimum anywhere. Two source scans (no layout engine under
 * jsdom, lesson 075):
 *   1. No CSS rule on a table surface declares a font-size under 14px.
 *   2. The table's TSX uses no 9/10/11px or `text-xs` utility and no uppercase
 *      header treatment.
 * On main: ColumnHeader is `text-[9px] ... uppercase`, the DCP numeral is 11px
 * and the overlay provenance line is 10px.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../..')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const FLOOR_PX = 14

/** Selectors that style the Clubs table's own text. */
const TABLE_SELECTOR =
  /#clubs-table|\.clubs-(?:col-header|dcp|trend-cell|cell|members|name-link|table)|\.club-status-overlay|\.dt(?:-|\b)/

function pxOf(value: string): number | null {
  const v = value.trim()
  const px = v.match(/^([\d.]+)px$/)
  if (px) return Number(px[1])
  const rem = v.match(/^([\d.]+)rem$/)
  if (rem) return Number(rem[1]) * 16
  return null // keyword, var(), calc(): not a literal below the floor
}

function tableFontSizes(css: string): Array<{ selector: string; px: number }> {
  const out: Array<{ selector: string; px: number }> = []
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim()
    if (!TABLE_SELECTOR.test(selector)) continue
    const fs = m[2].match(/(?:^|[;\s])font-size\s*:\s*([^;]+)/)
    if (!fs) continue
    const px = pxOf(fs[1])
    if (px !== null) out.push({ selector, px })
  }
  return out
}

describe('Clubs table type floor (#2676)', () => {
  const cssFiles = [
    'styles/components/app-shell.css',
    'styles/clubs-table.css',
    'styles/components/data-table.css',
  ]

  it.each(cssFiles)('%s: no table rule sets a font-size under 14px', file => {
    const path = resolve(src, file)
    if (!existsSync(path)) return
    const small = tableFontSizes(readFileSync(path, 'utf8')).filter(
      r => r.px < FLOOR_PX
    )
    expect(
      small,
      `rules under ${FLOOR_PX}px: ${small.map(r => `${r.selector} ${r.px}px`).join('; ')}`
    ).toEqual([])
  })

  it('data-table.css exists and defines the 14px type tokens', () => {
    const path = resolve(src, 'styles/components/data-table.css')
    expect(existsSync(path)).toBe(true)
    const css = stripComments(readFileSync(path, 'utf8'))
    expect(css).toMatch(/--dt-font\s*:\s*14px/)
    expect(css).toMatch(/--dt-header-font\s*:\s*14px/)
  })

  const tsxFiles = [
    'components/ColumnHeader.tsx',
    'components/clubsColumns.tsx',
    'components/dataTable/cells/StatusMarker.tsx',
    'components/dataTable/cells/HealthStatusCell.tsx',
    'components/dataTable/cells/TierCell.tsx',
    'components/dataTable/cells/HealthLegend.tsx',
  ]

  it.each(tsxFiles)('%s: no small-text utilities and no uppercase', file => {
    const path = resolve(src, file)
    if (!existsSync(path)) return
    const code = readFileSync(path, 'utf8')
    expect(code).not.toMatch(/text-\[(?:9|10|11)px\]/)
    expect(code).not.toMatch(/\btext-xs\b/)
    expect(code).not.toMatch(/\buppercase\b(?!\s*\*)/)
  })
})
