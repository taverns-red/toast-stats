/**
 * ActionTable (#1577) — the compact, aligned table the four Area Director
 * Actions sections render into.
 *
 * These assertions are deliberately about the RENDERED DOM, not about the
 * column spec handed in: a component that reordered, flattened or restyled
 * its output would still receive the same props (lesson "a mocked renderer
 * can only prove the input order, not the rendered one"). So every check here
 * reads real `<th>`/`<td>` elements back out of the document.
 */

import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { ActionTable, type ActionTableColumn } from '../ActionTable'

interface Row {
  id: string
  club: string
  area: string
  detail: string
}

const rows: Row[] = [
  { id: 'c1', club: 'Alpha Club', area: 'A/01', detail: 'first' },
  { id: 'c2', club: 'Beta Club', area: 'B/02', detail: 'second' },
]

const columns: ActionTableColumn<Row>[] = [
  { key: 'club', header: 'Club', cell: r => r.club },
  { key: 'area', header: 'Area', cell: r => r.area },
  { key: 'detail', header: 'Detail', cell: r => r.detail },
]

const renderTable = () =>
  render(
    <MemoryRouter>
      <ActionTable
        caption="Example clubs"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        testId="example-table"
      />
    </MemoryRouter>
  )

describe('ActionTable (#1577)', () => {
  afterEach(() => cleanup())

  it('renders a real table with a caption naming the section', () => {
    renderTable()
    const table = screen.getByTestId('example-table')
    expect(table.tagName).toBe('TABLE')
    const caption = table.querySelector('caption')
    expect(caption).toHaveTextContent('Example clubs')
    // Visually hidden — the section heading already names it on screen.
    expect(caption).toHaveClass('action-table__caption')
  })

  it('exposes every column as a real <th scope="col">, in order', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map(h => h.textContent)).toEqual(['Club', 'Area', 'Detail'])
    for (const header of headers) {
      expect(header.tagName).toBe('TH')
      expect(header).toHaveAttribute('scope', 'col')
    }
    // The headers live in a <thead>, not as a styled first body row.
    const table = screen.getByTestId('example-table')
    expect(table.querySelector('thead')).toContainElement(headers[0]!)
  })

  it('renders one body row per item with cells in column order', () => {
    renderTable()
    const table = screen.getByTestId('example-table')
    const bodyRows = within(table.querySelector('tbody')!).getAllByRole('row')
    expect(bodyRows).toHaveLength(2)
    expect(
      within(bodyRows[0]!)
        .getAllByRole('cell')
        .map(c => c.textContent)
    ).toEqual(['Alpha Club', 'A/01', 'first'])
    expect(
      within(bodyRows[1]!)
        .getAllByRole('cell')
        .map(c => c.textContent)
    ).toEqual(['Beta Club', 'B/02', 'second'])
  })

  it('labels every cell with its column header for the <640px card rows', () => {
    // The mobile fallback is the pattern RaceTable established in #1562: the
    // header row is visually hidden and each cell prints `data-label` via a
    // ::before. A cell with no data-label renders an unlabelled value on a
    // phone, so the contract is asserted here rather than trusted to CSS.
    renderTable()
    const cells = screen.getAllByRole('cell')
    expect(cells).toHaveLength(6)
    expect(cells.map(c => c.getAttribute('data-label'))).toEqual([
      'Club',
      'Area',
      'Detail',
      'Club',
      'Area',
      'Detail',
    ])
  })

  it('wraps the table in its own scroll container so the page body never scrolls sideways', () => {
    renderTable()
    const table = screen.getByTestId('example-table')
    expect(table.parentElement).toHaveClass('action-table__scroll')
  })
})
