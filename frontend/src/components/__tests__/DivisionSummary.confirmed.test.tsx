/**
 * Division summary: confirmed Distinguished headline (#2580, part).
 *
 * On these surfaces `distinguishedClubs` is the confirmed count (the overlay in
 * `applyPipelineDistinguished` puts it there), and
 * `provisionalDistinguishedClubs` is the "+N qualifying today" beside it.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import DivisionSummary from '../DivisionSummary'

afterEach(() => cleanup())

const base = {
  divisionId: 'A',
  status: 'not-distinguished' as const,
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
        distinguishedClubs={3}
        provisionalDistinguishedClubs={2}
      />
    )
    const pill = screen.getByLabelText(/^Distinguished clubs:/)
    expect(pill).toHaveTextContent('3/5')
    expect(screen.getByTestId('distinguished-provisional')).toHaveTextContent(
      '+2 qualifying today'
    )
  })

  it('does not claim the threshold on the confirmed count when short', () => {
    render(
      <DivisionSummary
        {...base}
        distinguishedClubs={3}
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
        status="distinguished"
        distinguishedClubs={5}
        provisionalDistinguishedClubs={2}
      />
    )
    const pill = screen.getByLabelText(/^Distinguished clubs:/)
    expect(pill).toHaveTextContent('5/5')
    expect(pill.getAttribute('aria-label')).toMatch(/threshold met/)
  })

  it('shows no extra when nothing is provisional or it is unknown', () => {
    const { rerender } = render(
      <DivisionSummary
        {...base}
        distinguishedClubs={5}
        provisionalDistinguishedClubs={0}
      />
    )
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
    rerender(<DivisionSummary {...base} distinguishedClubs={5} />)
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
  })

  it('while the counts load, shows fixed-size placeholders, not the status, pill or gaps', () => {
    render(
      <DivisionSummary
        {...base}
        status="distinguished"
        distinguishedClubs={6}
        countsPending
        gapAnalysis={undefined}
      />
    )
    expect(
      screen.queryByRole('status', { name: /^Division status:/ })
    ).toBeNull()
    expect(screen.queryByLabelText(/^Distinguished clubs:/)).toBeNull()
    expect(screen.queryByText('6/5')).toBeNull()
    expect(screen.queryByTestId('distinguished-provisional')).toBeNull()
    expect(screen.getAllByTestId('distinguished-pending').length).toBe(2)
  })

  it('shows the real values once the counts are not pending', () => {
    render(<DivisionSummary {...base} distinguishedClubs={5} />)
    expect(screen.queryByTestId('distinguished-pending')).toBeNull()
    expect(
      screen.getByRole('status', { name: /^Division status:/ })
    ).toBeInTheDocument()
  })
})
