/**
 * Visit cells read visited-of-club-base plus the number needed (#2871).
 *
 * They used to read "completed/required", so Area 14 (base 5, all 5 visited,
 * 4 needed) showed "5/4 Met": the same x/y shape as the Paid cell's
 * "paid/base", read as 5 visits against 4 clubs. Now the denominator is the
 * club base and the requirement is stated separately.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { AreaPerformanceTable } from '../AreaPerformanceTable'
import { AreaPerformanceRow } from '../AreaPerformanceRow'
import type { AreaPerformance } from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'

afterEach(() => cleanup())

const visits = (completed: number, required: number) => ({
  completed,
  required,
  percentage: (completed / 5) * 100,
  meetsThreshold: completed >= required,
})

/** Base 5: 75% of 5 rounds up to 4 required. */
const area = (
  first: ReturnType<typeof visits>,
  second: ReturnType<typeof visits>
): AreaPerformance =>
  withRecognitionState(
    {
      areaId: '14',
      status: 'not-qualified',
      clubBase: 5,
      paidClubs: 3,
      netGrowth: -2,
      distinguishedClubs: 1,
      requiredDistinguishedClubs: 3,
      firstRoundVisits: first,
      secondRoundVisits: second,
      isQualified: false,
    },
    '2026-11-14'
  )

const text = (el: Element | null) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Any "a/b" whose denominator is the requirement (4), e.g. "5/4". */
const RATIO_OVER_REQUIREMENT = /\b\d+\s*\/\s*4\b/

describe('AreaPerformanceTable visit cells (#2871)', () => {
  const cells = () => {
    const row = within(screen.getByRole('table')).getByRole('rowheader', {
      name: '14',
    }).parentElement!
    const tds = row.querySelectorAll('td')
    return { first: tds[2], second: tds[3] }
  }

  it('met: "5 of 5 visited" with "4 needed" and Met', () => {
    render(<AreaPerformanceTable areas={[area(visits(5, 4), visits(4, 4))]} />)
    const { first, second } = cells()
    expect(text(first)).toContain('5 of 5 visited')
    expect(text(first)).toContain('4 needed')
    expect(text(first)).toContain('Met')
    expect(text(first)).not.toContain('Not met')
    expect(text(second)).toContain('4 of 5 visited')
  })

  it('not met: "2 of 5 visited" with "4 needed" and Not met', () => {
    render(<AreaPerformanceTable areas={[area(visits(2, 4), visits(0, 4))]} />)
    const { first, second } = cells()
    expect(text(first)).toContain('2 of 5 visited')
    expect(text(first)).toContain('4 needed')
    expect(text(first)).toContain('Not met')
    expect(text(second)).toContain('0 of 5 visited')
  })

  it('never renders a ratio whose denominator is the requirement', () => {
    render(<AreaPerformanceTable areas={[area(visits(5, 4), visits(2, 4))]} />)
    const { first, second } = cells()
    expect(text(first)).not.toMatch(RATIO_OVER_REQUIREMENT)
    expect(text(second)).not.toMatch(RATIO_OVER_REQUIREMENT)
  })
})

describe('AreaPerformanceRow visit cells (#2871)', () => {
  const rowCells = (a: AreaPerformance) => {
    const { container } = render(
      <table>
        <tbody>
          <AreaPerformanceRow area={a} />
        </tbody>
      </table>
    )
    return container.querySelectorAll('td')
  }

  it('met: "5 of 5 visited · 4 needed ✓"', () => {
    const tds = rowCells(area(visits(5, 4), visits(4, 4)))
    expect(text(tds[3])).toBe('5 of 5 visited · 4 needed ✓')
    expect(text(tds[4])).toBe('4 of 5 visited · 4 needed ✓')
  })

  it('not met: "2 of 5 visited · 4 needed ✗" and no ratio over the requirement', () => {
    const tds = rowCells(area(visits(2, 4), visits(0, 4)))
    expect(text(tds[3])).toBe('2 of 5 visited · 4 needed ✗')
    expect(text(tds[3])).not.toMatch(RATIO_OVER_REQUIREMENT)
    expect(text(tds[4])).not.toMatch(RATIO_OVER_REQUIREMENT)
  })
})
