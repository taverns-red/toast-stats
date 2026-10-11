/**
 * ActionTable on phones (#1833): when a section supplies `mobileRow`, below
 * 768 px the <640px card-table becomes MobileRowList compact rows — one link
 * per item to its routed page (club or area), 56–64 px, ≥44 px targets. The
 * desktop table (and a section that supplies no `mobileRow`) is unchanged.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { ActionTable, type ActionTableColumn } from '../ActionTable'

interface Row {
  id: string
  club: string
  area: string
}
const rows: Row[] = [
  { id: 'c1', club: 'Alpha Club', area: 'A/01' },
  { id: 'c2', club: 'Beta Club', area: 'B/02' },
]
const columns: ActionTableColumn<Row>[] = [
  { key: 'club', header: 'Club', cell: r => r.club },
  { key: 'area', header: 'Area', cell: r => r.area },
]

function stubMobile(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

const renderTable = (withMobileRow = true) =>
  render(
    <MemoryRouter>
      <ActionTable
        caption="Example clubs"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        testId="example-table"
        {...(withMobileRow
          ? {
              mobileRow: (r: Row) => ({
                id: r.id,
                to: `/district/61/club/${r.id}`,
                title: r.club,
                meta: `Area ${r.area}`,
              }),
            }
          : {})}
      />
    </MemoryRouter>
  )

beforeEach(() => stubMobile(true))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ActionTable < 768 px (#1833)', () => {
  it('renders compact row links named by the caption, not a table', () => {
    renderTable()
    expect(screen.queryByTestId('example-table')).toBeNull()
    const list = screen.getByRole('list', { name: 'Example clubs' })
    expect(list).toBeInTheDocument()
    const links = screen.getAllByTestId('mobile-row')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/district/61/club/c1')
    expect(links[0]).toHaveTextContent('Alpha Club')
    expect(links[0]).toHaveTextContent('Area A/01')
  })

  it('keeps the table when the section supplies no mobileRow', () => {
    renderTable(false)
    expect(screen.getByTestId('example-table').tagName).toBe('TABLE')
  })

  it('keeps the table at ≥ 768 px', () => {
    stubMobile(false)
    renderTable()
    expect(screen.getByTestId('example-table').tagName).toBe('TABLE')
    expect(screen.queryAllByTestId('mobile-row')).toHaveLength(0)
  })
})
