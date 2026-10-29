/**
 * @vitest-environment jsdom
 *
 * useUrlSuccessPlanTargets (#2297): `?targets=` is the only carrier. The
 * URL is the source of truth when present; within the tab session the last
 * targets seen for a district ride along to its subpages, the way `?py=`
 * does through ProgramYearContext. Nothing touches localStorage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import '@testing-library/jest-dom'
import {
  resetSuccessPlanTargetsMemory,
  useUrlSuccessPlanTargets,
} from '../useUrlSuccessPlanTargets'

const SET = { programYear: 2026, goals: { paidClubs: 105, payments: 4500 } }

/* Actions are buttons so the probe never writes outside itself. */
const Probe: React.FC<{ districtId: string }> = ({ districtId }) => {
  const { targets, setTargets } = useUrlSuccessPlanTargets(districtId)
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <span data-testid="search">{location.search}</span>
      <span data-testid="targets">{JSON.stringify(targets)}</span>
      <button onClick={() => setTargets(SET)}>set</button>
      <button onClick={() => setTargets(null)}>clear</button>
      <button onClick={() => navigate('/district/61/trends')}>trends</button>
      <button onClick={() => navigate('/district/62/other')}>other</button>
    </>
  )
}

const press = (name: string) =>
  act(() => fireEvent.click(screen.getByRole('button', { name })))

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/district/:id" element={<Probe districtId="61" />} />
        <Route
          path="/district/:id/trends"
          element={<Probe districtId="61" />}
        />
        <Route path="/district/:id/other" element={<Probe districtId="62" />} />
      </Routes>
    </MemoryRouter>
  )

const targetsText = () => screen.getByTestId('targets').textContent

describe('useUrlSuccessPlanTargets (#2297)', () => {
  beforeEach(() => resetSuccessPlanTargetsMemory())
  afterEach(() => cleanup())

  it('reads the targets from ?targets=', () => {
    renderAt('/district/61?targets=p-4500_py-2026')
    expect(JSON.parse(targetsText() ?? 'null')).toEqual({
      programYear: 2026,
      goals: { payments: 4500 },
    })
  })

  it('ignores a garbled param safely', () => {
    renderAt('/district/61?targets=%3Cscript%3E_p-x')
    expect(targetsText()).toBe('null')
  })

  it('writes the encoded targets into the URL, keeping other params', () => {
    renderAt('/district/61?py=2026')
    press('set')
    const search = new URLSearchParams(
      screen.getByTestId('search').textContent ?? ''
    )
    expect(search.get('targets')).toBe('c-105_p-4500_py-2026')
    expect(search.get('py')).toBe('2026')
  })

  it('clearing removes the param', () => {
    renderAt('/district/61?targets=p-4500_py-2026')
    press('clear')
    expect(screen.getByTestId('search').textContent).toBe('')
    expect(targetsText()).toBe('null')
  })

  it('carries the targets to a subpage of the same district', () => {
    renderAt('/district/61?targets=p-4500_py-2026')
    press('trends')
    expect(JSON.parse(targetsText() ?? 'null')).toEqual({
      programYear: 2026,
      goals: { payments: 4500 },
    })
  })

  it('does not carry one district’s targets to another district', () => {
    renderAt('/district/61?targets=p-4500_py-2026')
    press('other')
    expect(targetsText()).toBe('null')
  })

  it('a cleared plan stays cleared on the next subpage', () => {
    renderAt('/district/61?targets=p-4500_py-2026')
    press('clear')
    press('trends')
    expect(targetsText()).toBe('null')
  })

  it('never touches localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderAt('/district/61?targets=p-4500_py-2026')
    press('set')
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
