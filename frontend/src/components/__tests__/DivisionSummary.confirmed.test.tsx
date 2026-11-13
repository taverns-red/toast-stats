/**
 * Division summary: confirmed Distinguished headline (#2580, part).
 *
 * `distinguishedClubs` is the qualifying-today count the snapshot reports. When
 * `provisionalDistinguishedClubs` says part of it is not yet confirmed by April
 * renewals, the progress pill shows the confirmed count (and meets its
 * threshold on that basis) with the rest beside it as "+N qualifying today".
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import DivisionSummary from '../DivisionSummary'

afterEach(() => cleanup())

const base = {
  divisionId: 'A',
  status: 'distinguished' as const,
  paidClubs: 10,
  clubBase: 10,
  netGrowth: 0,
  requiredDistinguishedClubs: 5,
}

describe('DivisionSummary confirmed Distinguished count', () => {
  it('headlines the confirmed count with the extra beside it', () => {
    render(
      <DivisionSummary
        {...base}
        distinguishedClubs={5}
        provisionalDistinguishedClubs={2}
      />
    )
    const pill = screen.getByLabelText(/^Distinguished clubs:/)
    expect(pill).toHaveTextContent('3/5')
    expect(pill).not.toHaveTextContent('5/5')
    expect(screen.getByTestId('distinguished-provisional')).toHaveTextContent(
      '+2 qualifying today'
    )
  })

  it('does not claim the threshold on the confirmed count when short', () => {
    render(
      <DivisionSummary
        {...base}
        distinguishedClubs={5}
        provisionalDistinguishedClubs={2}
      />
    )
    const pill = screen.getByLabelText(/^Distinguished clubs:/)
    expect(pill.getAttribute('aria-label')).not.toMatch(/threshold met/)
    expect(pill).not.toHaveTextContent('✓')
  })

  it('claims the threshold when the confirmed count reaches it', () => {
    render(
      <DivisionSummary
        {...base}
        distinguishedClubs={7}
        provisionalDistinguishedClubs={2}
      />
    )
    const pill = screen.getByLabelText(/^Distinguished clubs:/)
    expect(pill).toHaveTextContent('5/5')
    expect(pill.getAttribute('aria-label')).toMatch(/threshold met/)
  })

  it('shows no extra when nothing is provisional', () => {
    render(
      <DivisionSummary
        {...base}
        distinguishedClubs={5}
        provisionalDistinguishedClubs={0}
      />
    )
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
    expect(screen.getByLabelText(/^Distinguished clubs:/)).toHaveTextContent(
      '5/5'
    )
  })

  it('shows no extra when the provisional part is unknown', () => {
    render(<DivisionSummary {...base} distinguishedClubs={5} />)
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
  })
})
