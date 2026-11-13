/**
 * ActionTable on the shared table styles (#2701, M2 of #2676; spec §14, §6,
 * §11). One component renders the Area Director Actions, Officer Training and
 * both growth-funnel tables, so adopting the `.dt` chrome here moves all of
 * them at once.
 *
 * DOM assertions read real elements; CSS assertions read the stylesheet as text
 * (jsdom has no layout engine, and R22 forbids page mounts in unit tests).
 */

import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ActionTable, type ActionTableColumn } from '../ActionTable'

interface Row {
  id: string
  club: string
  area: string
}

const columns: ActionTableColumn<Row>[] = [
  { key: 'club', header: 'Club', cell: r => r.club },
  { key: 'area', header: 'Area', cell: r => r.area },
]

const rows: Row[] = [
  { id: 'c1', club: 'Alpha Club', area: 'A/01' },
  { id: 'c2', club: 'Beta Club', area: 'B/02' },
]

const read = (rel: string): string =>
  readFileSync(join(__dirname, '..', '..', rel), 'utf-8')

/** CSS with every @media block removed: the base (all-width) rules only. */
const baseCss = (css: string): string => {
  let out = ''
  let depth = 0
  let inMedia = false
  for (let i = 0; i < css.length; i++) {
    if (!inMedia && css.startsWith('@media', i)) {
      inMedia = true
      depth = 0
    }
    const ch = css[i]
    if (inMedia) {
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) inMedia = false
      }
      continue
    }
    out += ch
  }
  return out
}

/** The declaration block text of the first rule whose selector list matches. */
const ruleBody = (css: string, selector: RegExp): string | null => {
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const selectors = m[1]!.replace(/\/\*[\s\S]*?\*\//g, '')
    if (selectors.split(',').some(s => selector.test(s.trim()))) return m[2]!
  }
  return null
}

const renderTable = () =>
  render(
    <MemoryRouter>
      <ActionTable
        caption="Example clubs"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        testId="t"
      />
    </MemoryRouter>
  )

describe('ActionTable on the shared table styles (#2701)', () => {
  afterEach(() => cleanup())

  it('uses the shared .dt table and .dt-scroll wrapper', () => {
    renderTable()
    const table = screen.getByTestId('t')
    expect(table).toHaveClass('dt')
    expect(table.parentElement).toHaveClass('dt-scroll')
  })

  it('names the table with a caption', () => {
    renderTable()
    expect(screen.getByTestId('t').querySelector('caption')).toHaveTextContent(
      'Example clubs'
    )
  })

  it('makes the first column the row header: th scope=row, not a td', () => {
    renderTable()
    const bodyRows = within(
      screen.getByTestId('t').querySelector('tbody')!
    ).getAllByRole('row')
    for (const row of bodyRows) {
      const heads = row.querySelectorAll('th')
      expect(heads).toHaveLength(1)
      expect(heads[0]).toHaveAttribute('scope', 'row')
      expect(row.querySelectorAll('td')).toHaveLength(1)
    }
    expect(screen.getAllByRole('rowheader').map(h => h.textContent)).toEqual([
      'Alpha Club',
      'Beta Club',
    ])
  })

  it('honours an explicit rowHeader column that is not first', () => {
    const cols: ActionTableColumn<Row>[] = [
      { key: 'area', header: 'Area', cell: r => r.area },
      { key: 'club', header: 'Club', cell: r => r.club, rowHeader: true },
    ]
    render(
      <MemoryRouter>
        <ActionTable
          caption="x"
          columns={cols}
          rows={rows}
          rowKey={r => r.id}
        />
      </MemoryRouter>
    )
    expect(screen.getAllByRole('rowheader').map(h => h.textContent)).toEqual([
      'Alpha Club',
      'Beta Club',
    ])
  })
})

describe('ActionTable stylesheet (#2701)', () => {
  const css = read('styles/components/action-list.css')
  const tableCss = css.slice(css.indexOf('.action-table__scroll {'))

  it('has no CSS-hidden columns', () => {
    expect(tableCss).not.toMatch(/display:\s*none/)
  })

  it('keeps every table font size at or above the 14px floor', () => {
    const sizes = [...tableCss.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)]
    const tooSmall = sizes.filter(([, n, unit]) => {
      const px = unit === 'rem' ? Number(n) * 16 : Number(n)
      return px < 14
    })
    expect(tooSmall.map(m => m[0])).toEqual([])
  })

  it('gives name links a 44px hit area at every width', () => {
    const body = ruleBody(baseCss(tableCss), /^\.action-table__link$/)
    expect(body).not.toBeNull()
    expect(body).toMatch(/min-height:\s*44px/)
    expect(body).toMatch(/display:\s*(inline-)?flex/)
  })
})

describe('Area Director Actions status columns (#2701)', () => {
  const page = read('pages/DistrictActionListPage.tsx')

  it('render health with HealthStatusCell, not bare label text', () => {
    expect(page).toMatch(/import\s*\{\s*HealthStatusCell\s*\}/)
    expect(page).toMatch(/<HealthStatusCell\b/)
  })
})

describe('ActionTable stays out of the entry chunk (#2701)', () => {
  it('does not import TanStack or the DataTable shell', () => {
    const src = read('components/ActionTable.tsx')
    expect(src).not.toMatch(/@tanstack/)
    expect(src).not.toMatch(/dataTable\/DataTable/)
  })
})
