/**
 * AreaPerformanceTable below 768 (#1834, mobile epic #1827).
 *
 * The 9-column area table (Divisions page ×N, Division page, Area page)
 * scrolled 731px inside a 261px box at 375, with headers wrapping to 3
 * lines. Below 768 it becomes a PriorityColumnsTable: area + 2 chosen
 * metrics (?cols=), the recognition badge as a short chip, and the full
 * table in the sheet. ≥768 is covered unchanged by AreaPerformanceTable.test.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AreaPerformanceTable } from '../AreaPerformanceTable'
import type { AreaPerformance } from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

afterEach(() => cleanup())

const visits = (completed: number, required: number) => ({
  completed,
  required,
  percentage: (completed / required) * 100,
  meetsThreshold: completed >= required,
})

const AREAS: AreaPerformance[] = [
  withRecognitionState(
    {
      areaId: 'B1',
      status: 'presidents-distinguished',
      clubBase: 12,
      paidClubs: 14,
      netGrowth: 2,
      distinguishedClubs: 8,
      requiredDistinguishedClubs: 6,
      firstRoundVisits: visits(10, 9),
      secondRoundVisits: visits(10, 9),
      isQualified: true,
    },
    '2026-06-15'
  ),
  withRecognitionState(
    {
      areaId: 'A2',
      status: 'not-qualified',
      clubBase: 8,
      paidClubs: 7,
      netGrowth: -1,
      distinguishedClubs: 3,
      requiredDistinguishedClubs: 4,
      firstRoundVisits: visits(5, 6),
      secondRoundVisits: visits(5, 6),
      isQualified: false,
    },
    '2026-06-15'
  ),
]

const Where = () => <output data-testid="where">{useLocation().search}</output>

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/district/61/divisions']}>
      <AreaPerformanceTable areas={AREAS} label="Division A area performance" />
      <Where />
    </MemoryRouter>
  )

const table = () =>
  screen.getByRole('table', { name: 'Division A area performance' })
const headers = () =>
  [...table().querySelectorAll('thead th')].map(th => th.textContent?.trim())

describe('AreaPerformanceTable priority columns below 768 (#1834)', () => {
  it('shows area + Paid + Award, areas in id order, no scroll region', () => {
    renderAt()
    expect(headers()).toEqual(['Area', 'Paid', 'Award'])
    const ids = [...table().querySelectorAll('tbody tr')].map(
      tr => tr.querySelector('td')?.textContent
    )
    expect(ids).toEqual(['A2', 'B1'])
    expect(
      screen.queryByRole('region', { name: /scroll horizontally/ })
    ).toBeNull()
  })

  it('stacks paid/base over its percentage', () => {
    renderAt()
    const b1 = within(table()).getByText('B1').closest('tr')!
    expect(within(b1).getByText('14/12')).toBeInTheDocument()
    expect(within(b1).getByText('117%')).toBeInTheDocument()
  })

  it('shows the recognition badge as a short chip, full label for AT', () => {
    renderAt()
    const chip = within(table()).getByTitle("President's Distinguished")
    expect(chip.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      'Pres.'
    )
    expect(chip.querySelector('.sr-only')?.textContent).toBe(
      "President's Distinguished"
    )
  })

  it('opens what a shortened chip means by tap or keyboard, not only by title (#2762)', () => {
    const provisional = withRecognitionState({
      areaId: 'C3',
      status: 'presidents-distinguished',
      clubBase: 10,
      paidClubs: 12,
      netGrowth: 2,
      distinguishedClubs: 7,
      requiredDistinguishedClubs: 5,
      firstRoundVisits: visits(9, 8),
      secondRoundVisits: visits(2, 8),
      isQualified: false,
    })
    render(
      <MemoryRouter>
        <AreaPerformanceTable areas={[provisional]} label="Division C" />
      </MemoryRouter>
    )
    const row = within(screen.getByRole('table', { name: 'Division C' }))
      .getByText('C3')
      .closest('tr')!
    expect(row.textContent).toContain('Pres. (prov.)')
    const trigger = within(row).getByRole('button', {
      name: 'About area C3 recognition',
    })
    fireEvent.click(trigger)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent("President's Distinguished (Provisional)")
    expect(tip).toHaveTextContent(/2nd-round visits due/)
  })

  it('a chip swaps a metric in and persists it as ?cols=', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Gap D' }))
    expect(headers()).toEqual(['Area', 'Award', 'Gap D'])
    expect(screen.getByTestId('where').textContent).toBe('?cols=award%2CgapD')
  })

  it('the Visit 1 chip reads visited of club base plus needed (#2871)', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Visit 1' }))
    const a2 = within(table()).getByText('A2').closest('tr')!
    // A2: base 8, 5 visited, 6 needed. Never "5/6" (a ratio over the need).
    expect(a2.textContent).toContain('5 of 8 visited')
    expect(a2.textContent).toContain('6 needed')
    expect(a2.textContent).not.toMatch(/\b5\/6\b/)
  })

  it('opens the complete 9-column table in the full-screen sheet', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /full table/i }))
    const dialog = screen.getByRole('dialog', { name: /Division A/ })
    const full = within(within(dialog).getByRole('region')).getByRole('table')
    expect(full.querySelectorAll('thead th')).toHaveLength(9)
  })
})
