import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ClubCompliancePanel } from '../ClubCompliancePanel'
import type { ComplianceRow } from '../../../utils/clubCompliance'

/**
 * #1790 — Compliance panel: a row list, not a table (mobile review §6.3).
 * Each row: label, status text (never colour alone), and its source/as-of
 * as secondary text. Coach is the last row; no names anywhere.
 */
const ROWS: ComplianceRow[] = [
  {
    key: 'officerList',
    label: 'Officer list',
    state: 'ok',
    value: 'Received May 25, 2026',
    source: 'Officer list report · October 11, 2026',
  },
  {
    key: 'csp',
    label: 'Club Success Plan',
    state: 'bad',
    value: 'Not submitted — deadline 30 September 2026 passed',
    source: 'Club Success Plan report · October 11, 2026',
  },
]

describe('ClubCompliancePanel', () => {
  it('renders one list item per row plus the coach row', () => {
    render(
      <ClubCompliancePanel
        rows={ROWS}
        coach={{
          status: 'active',
          label: 'Active since Sep 30, 2026',
          source: 'Coaches report · October 11, 2026',
        }}
      />
    )
    const panel = screen.getByRole('region', { name: 'Compliance' })
    const items = within(panel).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Officer list')
    expect(items[0]).toHaveTextContent('Received May 25, 2026')
    expect(items[0]).toHaveTextContent('Officer list report · October 11, 2026')
    expect(items[2]).toHaveTextContent('Coach')
    expect(items[2]).toHaveTextContent('Active since Sep 30, 2026')
  })

  it('carries the state as a class and a text glyph, not colour alone', () => {
    render(<ClubCompliancePanel rows={ROWS} coach={null} />)
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveClass('club-compliance__row--bad')
    expect(within(items[1]!).getByText('✗')).toBeInTheDocument()
  })

  it('shows the coach row as not available when the date has no coaches report', () => {
    render(<ClubCompliancePanel rows={ROWS} coach={null} />)
    const items = screen.getAllByRole('listitem')
    expect(items[2]).toHaveTextContent('Not available for this date')
  })
})
