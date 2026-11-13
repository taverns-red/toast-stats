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

  describe('club status (#2639)', () => {
    it('names a Suspended club, with the date when known', () => {
      render(
        <ClubHeroStatusChips
          status="intervention-required"
          clubStatus="Suspended"
          statusSince="Sep 30, 2026"
        />
      )
      const chip = screen.getByText(/^Suspended/).closest('.club-hero__chip')
      expect(chip).toHaveClass('club-hero__chip--at-risk')
      expect(chip).toHaveTextContent('Suspended since Sep 30, 2026')
    })

    it.each(['Low', 'Ineligible'])('names a %s club', clubStatus => {
      render(
        <ClubHeroStatusChips status="vulnerable" clubStatus={clubStatus} />
      )
      expect(screen.getByText(clubStatus)).toBeInTheDocument()
    })

    it.each([
      ['Low', 'club-hero__chip--watch'],
      ['Ineligible', 'club-hero__chip--at-risk'],
      ['Suspended', 'club-hero__chip--at-risk'],
    ])(
      'gives a %s club a dotted chip, distinct from a neutral one (#2669)',
      (clubStatus, cls) => {
        render(
          <ClubHeroStatusChips status="thriving" clubStatus={clubStatus} />
        )
        const chip = screen.getByText(clubStatus).closest('.club-hero__chip')
        expect(chip).toHaveClass(cls)
        expect(chip?.querySelector('.club-hero__chip-dot')).not.toBeNull()
      }
    )

    it.each(['Active', undefined])('adds no chip for %s', clubStatus => {
      const { container } = render(
        <ClubHeroStatusChips status="thriving" clubStatus={clubStatus} />
      )
      expect(container.querySelectorAll('.club-hero__chip')).toHaveLength(1)
    })
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
