/**
 * Phone area table: confirmed Distinguished column (#2580, part). Ron's
 * 2026-11-13 call for the other compact tables applies here too: the extra
 * "+N qualifying today" sits on its own line under the confirmed count.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { AreaPerformanceTable } from '../AreaPerformanceTable'
import type { AreaPerformance } from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

afterEach(() => cleanup())

const visits = {
  completed: 8,
  required: 8,
  percentage: 100,
  meetsThreshold: true,
}

const AREA: AreaPerformance = {
  ...withRecognitionState(
    {
      areaId: 'A1',
      status: 'distinguished',
      clubBase: 10,
      paidClubs: 10,
      netGrowth: 0,
      distinguishedClubs: 4,
      requiredDistinguishedClubs: 5,
      firstRoundVisits: visits,
      secondRoundVisits: visits,
      isQualified: true,
    },
    '2026-03-15'
  ),
  provisionalDistinguishedClubs: 2,
}

describe('AreaPerformanceTable Dist. column on phones (#2580)', () => {
  it('stacks confirmed/base, its percentage and the extra line', () => {
    render(
      <MemoryRouter initialEntries={['/district/61/divisions?cols=dist,award']}>
        <AreaPerformanceTable
          areas={[AREA]}
          label="Division A area performance"
        />
      </MemoryRouter>
    )
    const row = screen.getByText('A1').closest('tr')!
    expect(within(row).getByText('4/10')).toBeInTheDocument()
    expect(within(row).getByText('40%')).toBeInTheDocument()
    expect(
      within(row).getByTestId('distinguished-provisional')
    ).toHaveTextContent('+2 qualifying today')
  })

  it('shows a placeholder, not the qualifying-today count, while loading', () => {
    render(
      <MemoryRouter initialEntries={['/district/61/divisions?cols=dist,award']}>
        <AreaPerformanceTable
          areas={[AREA]}
          label="Division A area performance"
          countsPending
        />
      </MemoryRouter>
    )
    const row = screen.getByText('A1').closest('tr')!
    expect(within(row).queryByText('4/10')).toBeNull()
    expect(
      within(row).getAllByTestId('distinguished-pending').length
    ).toBeGreaterThanOrEqual(1)
  })
})
