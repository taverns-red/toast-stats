/**
 * Back returns to the previous snapshot date (#2412).
 *
 * The real header controls (DataControlsBar, and the mobile
 * ContextSheetControls) wired to the real useUrlProgramYear +
 * ProgramYearProvider, exactly as every page wires them
 * (`onDateChange={setSelectedDate}`). Pick date A, pick date B, press Back:
 * the controls must show A again. Before #2412 every pick replaced the entry,
 * so Back left the page instead.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'

vi.mock('../../hooks/useDefaultProgramYear', () => ({
  useDefaultProgramYear: () => ({
    year: 2025,
    startDate: '2025-07-01',
    endDate: '2026-06-30',
    label: '2025-2026',
  }),
}))

import { useUrlProgramYear } from '../../hooks/useUrlProgramYear'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DataControlsBar } from '../../components/DataControlsBar'
import { ContextSheetControls } from '../../components/ContextSheetControls'
import { getProgramYear } from '../../utils/programYear'
import { snap } from '../../test-utils/snapshotDate'

const DATES = [snap('2025-08-31'), snap('2025-09-30'), snap('2025-10-31')]
const YEARS = [getProgramYear(2025), getProgramYear(2024)]

let navigateRef: ReturnType<typeof useNavigate> | null = null

function Harness({ sheet }: { sheet: boolean }) {
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
  } = useUrlProgramYear()
  const navigate = useNavigate()
  const location = useLocation()
  React.useEffect(() => {
    navigateRef = navigate
  }, [navigate])
  return (
    <>
      <p data-testid="search">{location.search}</p>
      {sheet ? (
        <ContextSheetControls
          availableProgramYears={YEARS}
          selectedProgramYear={selectedProgramYear}
          onProgramYearChange={setSelectedProgramYear}
          availableDates={DATES}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      ) : (
        <DataControlsBar
          latestSnapshotDate={DATES[2]}
          availableProgramYears={YEARS}
          selectedProgramYear={selectedProgramYear}
          onProgramYearChange={setSelectedProgramYear}
          availableDates={DATES}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      )}
    </>
  )
}

function mount(sheet: boolean) {
  render(
    <MemoryRouter initialEntries={['/prior', '/page']} initialIndex={1}>
      <ProgramYearProvider>
        <Routes>
          <Route path="/prior" element={<p>prior page</p>} />
          <Route path="/page" element={<Harness sheet={sheet} />} />
        </Routes>
      </ProgramYearProvider>
    </MemoryRouter>
  )
}

const back = () => act(() => navigateRef!(-1))

describe('Back after a date pick (#2412)', () => {
  it('header chips: pick A, pick B, Back shows A', () => {
    mount(false)
    const dateSelect = () =>
      screen.getByTestId<HTMLSelectElement>('date-chip-select')

    fireEvent.change(dateSelect(), { target: { value: '2025-09-30' } })
    fireEvent.change(dateSelect(), { target: { value: '2025-10-31' } })
    expect(dateSelect().value).toBe('2025-10-31')

    back()
    expect(screen.queryByText('prior page')).toBeNull()
    expect(dateSelect().value).toBe('2025-09-30')
    expect(screen.getByTestId('search').textContent).toBe('?date=2025-09-30')
  })

  it('header chips: a PY pick pushes too', () => {
    mount(false)
    fireEvent.change(screen.getByTestId('py-chip-select'), {
      target: { value: '2024' },
    })
    expect(screen.getByTestId('search').textContent).toBe('?py=2024')

    back()
    expect(screen.queryByText('prior page')).toBeNull()
    expect(screen.getByTestId<HTMLSelectElement>('py-chip-select').value).toBe(
      '2025'
    )
  })

  it('mobile context sheet: pick A, pick B, Back shows A', () => {
    mount(true)
    const dateSelect = () =>
      screen.getByTestId<HTMLSelectElement>('context-sheet-date')

    fireEvent.change(dateSelect(), { target: { value: '2025-08-31' } })
    fireEvent.change(dateSelect(), { target: { value: '2025-09-30' } })

    back()
    expect(screen.queryByText('prior page')).toBeNull()
    expect(dateSelect().value).toBe('2025-08-31')
  })
})
