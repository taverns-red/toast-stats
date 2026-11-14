import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useUrlDatePair } from '../useUrlDatePair'

/* #2475 — month-end reconciliation revisions. The date list is tokens: a bare
   date, or `monthEnd@asOf` for an EARLIER revision; the newest revision is the
   plain month end, also spelled `monthEnd@asOf` (an alias). An `@asOf` that is
   in neither is not a point this district has, so that side falls back (R3). */

const TOKENS = [
  '2026-10-29',
  '2026-10-30',
  '2026-10-31@2026-11-02',
  '2026-10-31',
]
const ALIASES = { '2026-10-31@2026-11-03': '2026-10-31' }

const Harness: React.FC = () => {
  const { from, to, setFrom } = useUrlDatePair(TOKENS, { aliases: ALIASES })
  const { search } = useLocation()
  return (
    <div>
      <span data-testid="from">{from ?? 'none'}</span>
      <span data-testid="to">{to ?? 'none'}</span>
      <span data-testid="search">{search}</span>
      <button onClick={() => setFrom('2026-10-31@2026-11-02')}>
        from-revision
      </button>
      <button onClick={() => setFrom('2026-10-30')}>from-other</button>
    </div>
  )
}

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness />
    </MemoryRouter>
  )

describe('useUrlDatePair — revision tokens (#2475)', () => {
  it('defaults to previous revision → latest revision while reconciling', () => {
    renderAt('/district/61/changes')
    expect(screen.getByTestId('from')).toHaveTextContent(
      '2026-10-31@2026-11-02'
    )
    expect(screen.getByTestId('to')).toHaveTextContent(/^2026-10-31$/)
  })

  it('deep-links a revision with ?to=…@asOf', () => {
    renderAt('/district/61/changes?from=2026-10-30&to=2026-10-31@2026-11-02')
    expect(screen.getByTestId('from')).toHaveTextContent(/^2026-10-30$/)
    expect(screen.getByTestId('to')).toHaveTextContent('2026-10-31@2026-11-02')
  })

  it('resolves the newest revision spelled with its asOf to the plain month end', () => {
    renderAt('/district/61/changes?from=2026-10-31@2026-11-03&to=2026-10-30')
    expect(screen.getByTestId('from')).toHaveTextContent(/^2026-10-31$/)
    expect(screen.getByTestId('to')).toHaveTextContent(/^2026-10-30$/)
  })

  it('falls back to the default for an @asOf that is not in the index', () => {
    renderAt('/district/61/changes?from=2026-10-29&to=2026-10-31@2099-01-01')
    expect(screen.getByTestId('from')).toHaveTextContent(/^2026-10-29$/)
    expect(screen.getByTestId('to')).toHaveTextContent(/^2026-10-31$/) // default
  })

  it('falls back on a bare @asOf with no date', () => {
    renderAt('/district/61/changes?from=@2026-11-02')
    expect(screen.getByTestId('from')).toHaveTextContent(
      '2026-10-31@2026-11-02'
    ) // default
  })

  it('writes a non-default selection and keeps the default pair clean', async () => {
    const user = userEvent.setup()
    renderAt('/district/61/changes?from=2026-10-30')
    await user.click(screen.getByText('from-revision'))
    expect(screen.getByTestId('search')).not.toHaveTextContent('from=')
    await user.click(screen.getByText('from-other'))
    expect(screen.getByTestId('search')).toHaveTextContent('from=2026-10-30')
  })
})
