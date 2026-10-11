/**
 * Division and Area Progress Summary on phones (#1862, mobile epic #1827).
 *
 * At 375 px the summary rendered every division narrative and every area
 * narrative in full: ~21,700 px of the D61 divisions page. Below 768 each
 * division becomes a collapsed disclosure (name, recognition status by glyph +
 * text, area count); opening it shows the unchanged narratives. The open set is
 * controllable so the page can keep it in the URL (R3). Desktop unchanged.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DivisionAreaProgressSummary } from '../DivisionAreaProgressSummary'
import type { DivisionPerformance } from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

const area = (areaId: string) =>
  withRecognitionState(
    {
      areaId,
      status: 'not-distinguished',
      clubBase: 5,
      paidClubs: 5,
      netGrowth: 0,
      distinguishedClubs: 0,
      requiredDistinguishedClubs: 3,
      firstRoundVisits: {
        completed: 5,
        required: 4,
        percentage: 100,
        meetsThreshold: true,
      },
      secondRoundVisits: {
        completed: 5,
        required: 4,
        percentage: 100,
        meetsThreshold: true,
      },
      isQualified: true,
    },
    '2026-09-11'
  )

const division = (
  divisionId: string,
  over: Partial<DivisionPerformance> = {}
): DivisionPerformance => ({
  divisionId,
  status: 'not-distinguished',
  clubBase: 10,
  paidClubs: 10,
  netGrowth: 0,
  distinguishedClubs: 0,
  requiredDistinguishedClubs: 5,
  areas: [area(`${divisionId}1`), area(`${divisionId}2`)],
  cspTracked: false,
  cspSubmittedCount: 0,
  clubsMissingCsp: [],
  ...over,
})

const DIVISIONS = [
  division('A', { paidClubs: 8, netGrowth: -2 }),
  division('B'),
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

beforeEach(() => stubMobile(true))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DivisionAreaProgressSummary < 768 px (#1862)', () => {
  it('collapses each division to a ≥44 px disclosure with status and area count', () => {
    render(<DivisionAreaProgressSummary divisions={DIVISIONS} />)
    const a = screen.getByRole('button', { name: /Division A/ })
    expect(a).toHaveAttribute('aria-expanded', 'false')
    expect(a).toHaveTextContent('✗ Net loss')
    expect(a).toHaveTextContent('2 areas')
    // Narratives are not rendered while collapsed.
    expect(screen.queryByText('Division A Progress')).toBeNull()
    expect(screen.queryByText('Area A1')).toBeNull()
  })

  it('opens a division to show its narrative and areas (uncontrolled)', () => {
    render(<DivisionAreaProgressSummary divisions={DIVISIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /Division B/ }))
    expect(screen.getByRole('button', { name: /Division B/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('Division B Progress')).toBeInTheDocument()
    expect(screen.getByText('Area B1')).toBeInTheDocument()
    expect(screen.queryByText('Division A Progress')).toBeNull()
  })

  it('is controlled by openDivisions / onOpenDivisionsChange (URL-owned)', () => {
    const onOpenDivisionsChange = vi.fn()
    render(
      <DivisionAreaProgressSummary
        divisions={DIVISIONS}
        openDivisions={['B']}
        onOpenDivisionsChange={onOpenDivisionsChange}
      />
    )
    expect(screen.getByText('Division B Progress')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Division A/ }))
    expect(onOpenDivisionsChange).toHaveBeenCalledWith(['B', 'A'])
  })

  it('keeps every narrative visible at ≥ 768 px (no disclosures)', () => {
    stubMobile(false)
    render(<DivisionAreaProgressSummary divisions={DIVISIONS} />)
    expect(screen.queryByRole('button', { name: /Division A/ })).toBeNull()
    expect(screen.getByText('Division A Progress')).toBeInTheDocument()
    expect(screen.getByText('Division B Progress')).toBeInTheDocument()
  })
})
