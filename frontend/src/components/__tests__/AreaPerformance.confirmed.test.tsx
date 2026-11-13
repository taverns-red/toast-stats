/**
 * Area table and row: confirmed Distinguished headline (#2580, part).
 *
 * The count and the percentage are on the confirmed basis; clubs that qualify
 * on current membership but are not yet confirmed follow as "+N qualifying
 * today". The area "Provisional" recognition label is a tier status, a
 * different thing, and stays as it is.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AreaPerformanceTable } from '../AreaPerformanceTable'
import { AreaPerformanceRow } from '../AreaPerformanceRow'
import type { AreaPerformance } from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

const visits = {
  completed: 8,
  required: 8,
  percentage: 100,
  meetsThreshold: true,
}

function makeArea(over: Partial<AreaPerformance> = {}): AreaPerformance {
  return {
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
    ...over,
  }
}

afterEach(() => cleanup())

describe('AreaPerformanceTable confirmed Distinguished count', () => {
  it('shows confirmed over base and its percentage, with the extra', () => {
    render(
      <AreaPerformanceTable
        areas={[makeArea({ provisionalDistinguishedClubs: 2 })]}
      />
    )
    const row = screen.getByText('A1').closest('tr')!
    expect(row).toHaveTextContent('4/10 40%')
    expect(row).not.toHaveTextContent('6/10')
    expect(
      within(row).getByTestId('distinguished-provisional')
    ).toHaveTextContent('+2 qualifying today')
  })

  it('shows no extra when nothing is provisional or it is unknown', () => {
    render(
      <AreaPerformanceTable
        areas={[
          makeArea({ areaId: 'A1', provisionalDistinguishedClubs: 0 }),
          makeArea({ areaId: 'A2' }),
        ]}
      />
    )
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
    expect(screen.getByText('A2').closest('tr')).toHaveTextContent('4/10 40%')
  })
})

describe('AreaPerformanceRow confirmed Distinguished count', () => {
  it('shows confirmed over base and its percentage, with the extra', () => {
    render(
      <table>
        <tbody>
          <AreaPerformanceRow
            area={makeArea({ provisionalDistinguishedClubs: 2 })}
          />
        </tbody>
      </table>
    )
    const row = screen.getByText('A1').closest('tr')!
    expect(row).toHaveTextContent('4/10 40%')
    expect(
      within(row).getByTestId('distinguished-provisional')
    ).toHaveTextContent('+2 qualifying today')
  })
})

describe('AreaPerformanceTable reserved extra slot', () => {
  it('reserves an empty slot per row when asked, none otherwise', () => {
    const { rerender } = render(
      <AreaPerformanceTable areas={[makeArea()]} reserveExtra />
    )
    expect(screen.getByTestId('distinguished-extra-slot')).toBeEmptyDOMElement()
    rerender(<AreaPerformanceTable areas={[makeArea()]} />)
    expect(screen.queryByTestId('distinguished-extra-slot')).toBeNull()
  })

  it('keeps the extra inside the slot when there is one', () => {
    render(
      <AreaPerformanceTable
        areas={[makeArea({ provisionalDistinguishedClubs: 2 })]}
        reserveExtra
      />
    )
    expect(screen.getByTestId('distinguished-extra-slot')).toContainElement(
      screen.getByTestId('distinguished-provisional')
    )
  })
})
