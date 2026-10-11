/**
 * #1862: the recognition panel threads the page-owned open-division set to the
 * phone progress-summary disclosures, so the divisions page can keep it in the
 * URL (`?summary=`) — R3, never re-derived inside.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { DivisionAreaRecognitionPanel } from '../DivisionAreaRecognitionPanel'
import type { DivisionPerformance } from '../../utils/divisionStatus'

const division = (divisionId: string): DivisionPerformance => ({
  divisionId,
  status: 'not-distinguished',
  clubBase: 10,
  paidClubs: 10,
  netGrowth: 0,
  distinguishedClubs: 0,
  requiredDistinguishedClubs: 5,
  areas: [],
  cspTracked: false,
  cspSubmittedCount: 0,
  clubsMissingCsp: [],
})

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DivisionAreaRecognitionPanel phone summary state (#1862)', () => {
  it('passes openDivisions / onOpenDivisionsChange through to the summary', () => {
    const onOpenDivisionsChange = vi.fn()
    render(
      <MemoryRouter>
        <DivisionAreaRecognitionPanel
          divisions={[division('A'), division('B')]}
          openDivisions={['A']}
          onOpenDivisionsChange={onOpenDivisionsChange}
        />
      </MemoryRouter>
    )
    expect(screen.getByText('Division A Progress')).toBeInTheDocument()
    expect(screen.queryByText('Division B Progress')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Division B/ }))
    expect(onOpenDivisionsChange).toHaveBeenCalledWith(['A', 'B'])
  })
})
