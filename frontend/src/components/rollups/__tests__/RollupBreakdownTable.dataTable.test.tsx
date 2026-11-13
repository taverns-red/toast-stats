/**
 * Region/world health breakdown on the shared DataTable (#2733, #2676,
 * spec §14 M6). Sort only; the sort stays in the URL (ADR-005).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { RegionRollupsSchema } from '@taverns-red/shared-contracts'
import recorded from '../../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import { worldBreakdown } from '../../../utils/regionRollupView'
import { RollupBreakdownTable } from '../RollupBreakdownTable'

vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const rollups = RegionRollupsSchema.parse(recorded)

afterEach(() => cleanup())

const Where = () => <output data-testid="where">{useLocation().search}</output>

const setup = () =>
  render(
    <MemoryRouter initialEntries={['/regions/health']}>
      <RollupBreakdownTable
        rows={worldBreakdown(rollups)}
        label="Regions"
        identityHeader="Region"
      />
      <Where />
    </MemoryRouter>
  )

const getTable = () => screen.getByRole('table', { name: 'Regions' })

describe('RollupBreakdownTable on the DataTable (#2733)', () => {
  it('is a DataTable with a caption that says what and how many', () => {
    setup()
    const table = getTable()
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')?.textContent).toMatch(
      /regions.*14 regions/i
    )
  })

  it('makes the name the row header, with a real link', () => {
    setup()
    const cell = getTable().querySelector('tbody th')!
    expect(cell).toHaveAttribute('scope', 'row')
    expect(cell.querySelector('a')).toHaveAttribute('href', '/region/01/health')
  })

  it('has one header row of scope=col headers', () => {
    setup()
    const table = getTable()
    expect(table.querySelectorAll('thead tr')).toHaveLength(1)
    for (const th of table.querySelectorAll('thead th'))
      expect(th).toHaveAttribute('scope', 'col')
  })

  it('sorts from the header and keeps the sort in the URL', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^intervention$/i }))
    expect(screen.getByTestId('where').textContent).toMatch(/sort=intervention/)
    expect(getTable().querySelectorAll('thead th[aria-sort]')).toHaveLength(1)
  })

  it('hides no column with CSS', () => {
    setup()
    expect(getTable().innerHTML).not.toMatch(
      /class="(?:[^"]*\s)?(?:[a-z]+:)?(?:hidden|table-cell)(?:\s[^"]*)?"|__col--/
    )
  })

  it('sets no text below the 14px floor on the table', () => {
    setup()
    expect(getTable().innerHTML).not.toMatch(/\btext-(?:xs|\[(?:9|1[0-3])px\])/)
  })
})
