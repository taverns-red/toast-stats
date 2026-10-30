/**
 * useUrlProgramYear — push vs replace history (#2412)
 *
 * A user-initiated PY/date pick is navigation: it must PUSH a history entry so
 * browser Back returns to the previous date. Programmatic writes (self-heal,
 * clamping, mount defaults) call the setters with no options and must keep
 * REPLACE, so landing on a page never adds a phantom entry.
 *
 * Uses the real ProgramYearProvider so the "context follows the URL after
 * Back" criterion is exercised against the real context, not a mock.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

vi.mock('../useDefaultProgramYear', () => ({
  useDefaultProgramYear: () => ({
    year: 2025,
    startDate: '2025-07-01',
    endDate: '2026-06-30',
    label: '2025-2026',
  }),
}))

import { useUrlProgramYear, USER_PICK } from '../useUrlProgramYear'
import {
  ProgramYearProvider,
  useProgramYear,
} from '../../contexts/ProgramYearContext'
import { getProgramYear } from '../../utils/programYear'
import { snap } from '../../test-utils/snapshotDate'

function useHarness() {
  return {
    url: useUrlProgramYear(),
    ctx: useProgramYear(),
    navigate: useNavigate(),
    location: useLocation(),
  }
}

// Two entries: a prior page, then the page under test. A REPLACE leaves the
// stack at two, so Back lands on `/prior`; a PUSH adds a third, so Back lands
// on the page under test with its previous params.
function render(start = '/page') {
  return renderHook(() => useHarness(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/prior', start]} initialIndex={1}>
        <ProgramYearProvider>{children}</ProgramYearProvider>
      </MemoryRouter>
    ),
  })
}

const A = snap('2025-09-30')
const B = snap('2025-10-31')

describe('useUrlProgramYear history mode (#2412)', () => {
  describe('setSelectedDate', () => {
    it('a user pick pushes: pick A, pick B, Back shows A', async () => {
      const { result } = render()
      act(() => result.current.url.setSelectedDate(A, USER_PICK))
      act(() => result.current.url.setSelectedDate(B, USER_PICK))
      expect(result.current.url.selectedDate).toBe(B)

      act(() => result.current.navigate(-1))
      expect(result.current.location.pathname).toBe('/page')
      expect(result.current.url.selectedDate).toBe(A)
      await waitFor(() => expect(result.current.ctx.selectedDate).toBe(A))

      act(() => result.current.navigate(1))
      expect(result.current.url.selectedDate).toBe(B)
      await waitFor(() => expect(result.current.ctx.selectedDate).toBe(B))
    })

    it('a programmatic write (no options) replaces', () => {
      const { result } = render(`/page?date=${A}`)
      act(() => result.current.url.setSelectedDate(B))
      act(() => result.current.navigate(-1))
      expect(result.current.location.pathname).toBe('/prior')
    })

    it("an explicit { history: 'replace' } replaces", () => {
      const { result } = render(`/page?date=${A}`)
      act(() => result.current.url.setSelectedDate(B, { history: 'replace' }))
      act(() => result.current.navigate(-1))
      expect(result.current.location.pathname).toBe('/prior')
    })
  })

  describe('setSelectedProgramYear', () => {
    it('a user pick pushes, and Back restores the URL and the context PY', async () => {
      const { result } = render()
      expect(result.current.url.selectedProgramYear.year).toBe(2025)

      act(() =>
        result.current.url.setSelectedProgramYear(
          getProgramYear(2024),
          USER_PICK
        )
      )
      expect(result.current.location.search).toBe('?py=2024')
      await waitFor(() =>
        expect(result.current.ctx.selectedProgramYear.year).toBe(2024)
      )

      // Back to the entry with no `?py=` — the URL says "default PY", so the
      // in-session context year must not linger at 2024.
      act(() => result.current.navigate(-1))
      expect(result.current.location.pathname).toBe('/page')
      expect(result.current.location.search).toBe('')
      await waitFor(() =>
        expect(result.current.url.selectedProgramYear.year).toBe(2025)
      )
      expect(result.current.ctx.selectedProgramYear.year).toBe(2025)

      act(() => result.current.navigate(1))
      await waitFor(() =>
        expect(result.current.url.selectedProgramYear.year).toBe(2024)
      )
      expect(result.current.ctx.selectedProgramYear.year).toBe(2024)
    })

    it('a programmatic write (self-heal) replaces', () => {
      const { result } = render('/page?py=2019')
      act(() => result.current.url.setSelectedProgramYear(getProgramYear(2025)))
      act(() => result.current.navigate(-1))
      expect(result.current.location.pathname).toBe('/prior')
    })
  })

  describe('setProgramYearAndDate', () => {
    it('a user pick pushes', () => {
      const { result } = render(`/page?date=${A}`)
      act(() =>
        result.current.url.setProgramYearAndDate(
          getProgramYear(2024),
          undefined,
          USER_PICK
        )
      )
      act(() => result.current.navigate(-1))
      expect(result.current.location.pathname).toBe('/page')
      expect(result.current.url.selectedDate).toBe(A)
    })

    it('a programmatic write (no options) replaces', () => {
      const { result } = render(`/page?date=${A}`)
      act(() =>
        result.current.url.setProgramYearAndDate(
          getProgramYear(2024),
          undefined
        )
      )
      act(() => result.current.navigate(-1))
      expect(result.current.location.pathname).toBe('/prior')
    })
  })
})
