/**
 * ClubGrowthRecipientsSection (#1537) — the /awards recipients view. Each
 * checkpoint state must read as itself: pending is not "nobody won", an
 * unavailable count is not zero, and the reasons stay distinct.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { ClubGrowthRecipientsSection } from '../ClubGrowthRecipientsSection'
import type { ClubGrowthRecipientsCheckpoint } from '../../hooks/useClubGrowthRecipients'
import { CLUB_GROWTH_RECOGNITION } from '../recognition/recognitionRegistry'
import { snap } from '../../test-utils/snapshotDate'

expect.extend(toHaveNoViolations)
afterEach(() => cleanup())

const sepBase = {
  id: 'september' as const,
  checkpointDate: '2026-09-30',
  milestones: [3, 5] as const,
}
const marBase = {
  id: 'march' as const,
  checkpointDate: '2027-03-31',
  milestones: [3, 5, 10] as const,
}

const resolvedSep: ClubGrowthRecipientsCheckpoint = {
  ...sepBase,
  status: 'resolved',
  resolvedFromDate: snap('2026-09-30'),
  asOfDate: '2026-10-05',
  recipients: [
    {
      districtId: '94',
      districtName: 'District 94',
      region: '3',
      count: 9,
      milestone: 5,
    },
    {
      districtId: '226',
      districtName: 'District 226',
      region: '14',
      count: 8,
      milestone: 5,
    },
    {
      districtId: '79',
      districtName: 'District 79',
      region: '9',
      count: 3,
      milestone: 3,
    },
  ],
}

const renderSection = (checkpoints: ClubGrowthRecipientsCheckpoint[]) =>
  render(
    <MemoryRouter>
      <ClubGrowthRecipientsSection
        programYearLabel="2026-2027"
        checkpoints={checkpoints}
      />
    </MemoryRouter>
  )

describe('ClubGrowthRecipientsSection', () => {
  it('names the achievement from the registry, with its glyph and methodology link', () => {
    renderSection([resolvedSep, { ...marBase, status: 'pending' }])
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent(CLUB_GROWTH_RECOGNITION.title)
    expect(
      heading.querySelector(
        `[data-recognition="${CLUB_GROWTH_RECOGNITION.id}"]`
      )
    ).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Methodology' })).toHaveAttribute(
      'href',
      CLUB_GROWTH_RECOGNITION.methodologyHref
    )
  })

  it('groups settled recipients by the tier they reached, highest first, with the checkpoint count', () => {
    renderSection([resolvedSep, { ...marBase, status: 'pending' }])
    const sep = screen.getByTestId('club-growth-recipients-september')
    expect(within(sep).getByText(/3 districts achieved/)).toBeInTheDocument()
    const five = within(sep).getByTestId('club-growth-september-tier-5')
    const three = within(sep).getByTestId('club-growth-september-tier-3')
    expect(
      five.compareDocumentPosition(three) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(within(five).getAllByRole('listitem')).toHaveLength(2)
    expect(within(five).getByText('9 new clubs')).toBeInTheDocument()
    expect(
      within(five).getByRole('link', { name: 'District 94' })
    ).toHaveAttribute('href', '/district/94')
    // Provenance: the checkpoint date and the file's own as-of.
    expect(
      within(sep).getByText(/data as of October 5, 2026/)
    ).toBeInTheDocument()
  })

  it('states a pending checkpoint honestly — no recipients, no empty table', () => {
    renderSection([
      { ...sepBase, status: 'pending' },
      { ...marBase, status: 'pending' },
    ])
    const sep = screen.getByTestId('club-growth-recipients-september')
    expect(within(sep).getByText(/Not settled yet/)).toBeInTheDocument()
    expect(within(sep).queryByRole('list')).toBeNull()
    expect(within(sep).queryByText(/achieved/)).toBeNull()
  })

  it('says "no district reached a milestone" for a settled checkpoint with none', () => {
    renderSection([
      { ...resolvedSep, recipients: [] },
      { ...marBase, status: 'pending' },
    ])
    expect(
      screen.getByText('No district reached a milestone by September 30, 2026.')
    ).toBeInTheDocument()
  })

  it('renders each unavailable reason distinctly, never as zero', () => {
    const reasons = [
      'snapshot-missing',
      'count-absent',
      'count-not-collected',
    ] as const
    const texts = reasons.map(reason => {
      cleanup()
      renderSection([
        { ...sepBase, status: 'unavailable', reason },
        { ...marBase, status: 'pending' },
      ])
      const el = screen.getByTestId('club-growth-september-unavailable')
      expect(el).toHaveAttribute('data-reason', reason)
      expect(el.textContent).not.toMatch(/\b0\b/)
      return el.textContent
    })
    expect(new Set(texts).size).toBe(3)
  })

  it('holds a loading slot per checkpoint inside the same card', () => {
    renderSection([
      { ...sepBase, status: 'loading' },
      { ...marBase, status: 'loading' },
    ])
    expect(
      screen.getByTestId('club-growth-september-loading')
    ).toBeInTheDocument()
    expect(screen.getByTestId('club-growth-march-loading')).toBeInTheDocument()
  })

  it('has no axe violations with recipients', async () => {
    const { container } = renderSection([
      resolvedSep,
      { ...marBase, status: 'pending' },
    ])
    expect(await axe(container)).toHaveNoViolations()
  })
})
