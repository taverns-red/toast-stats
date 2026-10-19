/**
 * #2171 — the hero's health and DCP tier badges: one outline-chip style,
 * with a coloured dot only on the club-status chip.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ClubHeroStatusChips } from '../ClubHeroStatusChips'

afterEach(() => cleanup())

describe('ClubHeroStatusChips (#2171)', () => {
  it('renders the status as an outline chip with a status dot', () => {
    render(<ClubHeroStatusChips status="thriving" />)
    const chip = screen.getByText('Thriving').closest('.club-hero__chip')
    expect(chip).not.toBeNull()
    expect(chip).toHaveClass('club-hero__chip--thriving')
    expect(chip?.querySelector('.club-hero__chip-dot')).not.toBeNull()
  })

  it.each([
    ['vulnerable', 'Vulnerable', 'club-hero__chip--watch'],
    [
      'intervention-required',
      'Intervention required',
      'club-hero__chip--at-risk',
    ],
  ] as const)('maps %s to "%s" (%s)', (status, label, cls) => {
    render(<ClubHeroStatusChips status={status} />)
    expect(screen.getByText(label).closest('.club-hero__chip')).toHaveClass(cls)
  })

  it('renders the tier in the same chip style, without a dot', () => {
    render(
      <ClubHeroStatusChips status="thriving" distinguishedLevel="President" />
    )
    const tier = screen.getByText("President's").closest('.club-hero__chip')
    expect(tier).not.toBeNull()
    expect(tier?.querySelector('.club-hero__chip-dot')).toBeNull()
    // One style: no per-tier fill classes.
    expect(tier?.className).not.toMatch(/tier-/)
  })

  it('omits the tier chip when the club is not distinguished', () => {
    const { container } = render(
      <ClubHeroStatusChips
        status="thriving"
        distinguishedLevel="NotDistinguished"
      />
    )
    expect(container.querySelectorAll('.club-hero__chip')).toHaveLength(1)
  })

  it('marks a provisional tier and carries its tooltip', () => {
    render(
      <ClubHeroStatusChips
        status="thriving"
        distinguishedLevel="Select"
        provisionalTitle="Provisional until renewals"
      />
    )
    const tier = screen.getByText(/Select/).closest('.club-hero__chip')
    expect(tier).toHaveTextContent('Select (provisional)')
    expect(tier).toHaveAttribute('title', 'Provisional until renewals')
  })
})
