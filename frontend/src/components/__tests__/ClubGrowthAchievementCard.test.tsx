import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'

import { ClubGrowthAchievementCard } from '../ClubGrowthAchievementCard'
import type { ClubGrowthCheckpoint as ClubGrowthCheckpointRead } from '../../hooks/useClubGrowthMilestones'

expect.extend(toHaveNoViolations)
afterEach(() => cleanup())

/**
 * The achievement's first program year (A1, #1473). Anything earlier is
 * NOT-APPLICABLE — the card must not exist in the DOM at all.
 */
const PY = '2026-2027'
const LEGACY_PY = '2025-2026'

const SEP_DATE = '2026-09-30'
const MAR_DATE = '2027-03-31'

/** A checkpoint read as `useClubGrowthMilestones` (#1475) hands it over. */
const read = (
  id: 'september' | 'march',
  over: Partial<ClubGrowthCheckpointRead> = {}
): ClubGrowthCheckpointRead => ({
  id,
  checkpointDate: id === 'september' ? SEP_DATE : MAR_DATE,
  status: 'pending',
  newCharteredClubs: null,
  resolvedFromDate: null,
  asOfDate: null,
  isFallbackDate: false,
  unavailableReason: null,
  ...over,
})

const bothPending = [read('september'), read('march')]

const sepBlock = () => screen.getByTestId('club-growth-checkpoint-september30')
const marBlock = () => screen.getByTestId('club-growth-checkpoint-march31')

describe('ClubGrowthAchievementCard', () => {
  describe('applicability gate (A1 — PY 2026-2027 onward)', () => {
    it('renders nothing at all for a program year before the achievement existed', () => {
      const { container } = render(
        <ClubGrowthAchievementCard
          programYear={LEGACY_PY}
          asOfDate="2026-03-31"
          checkpointReads={[
            read('september', { checkpointDate: '2025-09-30' }),
            read('march', { checkpointDate: '2026-03-31' }),
          ]}
          toDateCount={7}
        />
      )

      // Not an empty shell, not a zeroed card — absent.
      expect(container.firstChild).toBeNull()
      expect(screen.queryByTestId('club-growth-achievement')).toBeNull()
      expect(
        screen.queryByRole('heading', { name: /club growth achievement/i })
      ).toBeNull()
    })

    it('renders nothing for an earlier program year even while the reads are loading', () => {
      const { container } = render(
        <ClubGrowthAchievementCard
          programYear={LEGACY_PY}
          asOfDate="2026-03-31"
          checkpointReads={[
            read('september', { status: 'loading' }),
            read('march', { status: 'loading' }),
          ]}
          isLoading
        />
      )
      expect(container.firstChild).toBeNull()
    })

    it('renders the card for the first applicable program year', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={bothPending}
          toDateCount={1}
        />
      )
      expect(screen.getByTestId('club-growth-achievement')).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: /club growth achievement/i })
      ).toBeInTheDocument()
    })
  })

  describe('pending checkpoint — the live race', () => {
    it('shows the running count, the gap to the next milestone, and the deadline', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={bothPending}
          toDateCount={1}
        />
      )

      const sep = sepBlock()
      expect(sep).toHaveAttribute('data-status', 'pending')
      expect(
        within(sep).getByTestId('club-growth-checkpoint-september30-count')
      ).toHaveTextContent('1')
      expect(
        within(sep).getByTestId('club-growth-checkpoint-september30-remaining')
      ).toHaveTextContent(/2 more by September 30/i)
      expect(sep).toHaveTextContent(/September 30, 2026/)
    })

    it('marks reached milestones reached and unreached ones unreached', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={bothPending}
          toDateCount={3}
        />
      )

      const sep = sepBlock()
      expect(
        within(sep).getByTestId('club-growth-milestone-september30-3')
      ).toHaveAttribute('data-state', 'reached')
      expect(
        within(sep).getByTestId('club-growth-milestone-september30-5')
      ).toHaveAttribute('data-state', 'unreached')
    })

    it('shows both September milestones reached before the deadline, still pending', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={bothPending}
          toDateCount={6}
        />
      )

      const sep = sepBlock()
      expect(sep).toHaveAttribute('data-status', 'pending')
      expect(
        within(sep).getByTestId('club-growth-milestone-september30-3')
      ).toHaveAttribute('data-state', 'reached')
      expect(
        within(sep).getByTestId('club-growth-milestone-september30-5')
      ).toHaveAttribute('data-state', 'reached')
      // Pending, not earned — the checkpoint has not passed.
      expect(
        within(sep).getByTestId('club-growth-checkpoint-september30-status')
      ).toHaveTextContent(/in progress/i)
      expect(within(sep).queryByText(/milestone earned/i)).toBeNull()
      // A clamped gap, never a signed delta (Lesson 102).
      expect(sep).not.toHaveTextContent(/-1|−1/)
    })

    it('counts the March checkpoint against the same running total (A2, cumulative)', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={bothPending}
          toDateCount={6}
        />
      )

      const mar = marBlock()
      expect(mar).toHaveAttribute('data-status', 'pending')
      expect(
        within(mar).getByTestId('club-growth-checkpoint-march31-count')
      ).toHaveTextContent('6')
      expect(
        within(mar).getByTestId('club-growth-checkpoint-march31-remaining')
      ).toHaveTextContent(/4 more by March 31/i)
      expect(
        within(mar).getByTestId('club-growth-milestone-march31-10')
      ).toHaveAttribute('data-state', 'unreached')
    })
  })

  describe('settled checkpoint', () => {
    it('shows the highest milestone earned and leaves the higher tier unreached', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-10-31"
          checkpointReads={[
            read('september', {
              status: 'resolved',
              newCharteredClubs: 4,
              resolvedFromDate:
                SEP_DATE as ClubGrowthCheckpointRead['resolvedFromDate'],
              asOfDate: SEP_DATE,
            }),
            read('march'),
          ]}
          toDateCount={5}
        />
      )

      const sep = sepBlock()
      expect(sep).toHaveAttribute('data-status', 'settled')
      expect(
        within(sep).getByTestId('club-growth-checkpoint-september30-earned')
      ).toHaveTextContent(/milestone earned: 3/i)
      expect(
        within(sep).getByTestId('club-growth-milestone-september30-3')
      ).toHaveAttribute('data-state', 'reached')
      expect(
        within(sep).getByTestId('club-growth-milestone-september30-5')
      ).toHaveAttribute('data-state', 'unreached')
    })

    it('says "no milestone" for a settled zero — distinct from unavailable', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-10-31"
          checkpointReads={[
            read('september', {
              status: 'resolved',
              newCharteredClubs: 0,
              resolvedFromDate:
                SEP_DATE as ClubGrowthCheckpointRead['resolvedFromDate'],
              asOfDate: SEP_DATE,
            }),
            read('march'),
          ]}
          toDateCount={0}
        />
      )

      const sep = sepBlock()
      expect(sep).toHaveAttribute('data-status', 'settled')
      expect(
        within(sep).getByTestId('club-growth-checkpoint-september30-none')
      ).toHaveTextContent(/no milestone/i)
      expect(
        within(sep).getByTestId('club-growth-checkpoint-september30-count')
      ).toHaveTextContent('0')
      expect(within(sep).queryByText(/not available/i)).toBeNull()
    })

    it('surfaces the as-of provenance when the read fell back to an earlier snapshot', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-10-31"
          checkpointReads={[
            read('september', {
              status: 'resolved',
              newCharteredClubs: 5,
              resolvedFromDate:
                '2026-09-28' as ClubGrowthCheckpointRead['resolvedFromDate'],
              asOfDate: '2026-10-10',
              isFallbackDate: true,
            }),
            read('march'),
          ]}
          toDateCount={5}
        />
      )

      expect(
        screen.getByTestId('club-growth-checkpoint-september30-provenance')
      ).toHaveTextContent(/2026-09-28/)
      expect(
        screen.getByTestId('club-growth-checkpoint-september30-provenance')
      ).toHaveTextContent(/2026-10-10/)
    })

    it('surfaces a later dashboard as-of date even when the pinned snapshot matched', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-10-31"
          checkpointReads={[
            read('september', {
              status: 'resolved',
              newCharteredClubs: 5,
              resolvedFromDate:
                SEP_DATE as ClubGrowthCheckpointRead['resolvedFromDate'],
              asOfDate: '2026-10-10',
            }),
            read('march'),
          ]}
          toDateCount={5}
        />
      )

      expect(
        screen.getByTestId('club-growth-checkpoint-september30-provenance')
      ).toHaveTextContent(/2026-10-10/)
    })
  })

  describe('unavailable checkpoint — never zero, never "not earned"', () => {
    it.each([
      ['snapshot-missing', /no snapshot/i],
      ['district-absent', /does not appear/i],
      ['count-absent', /predates/i],
    ] as const)(
      'renders an explicit unavailable state for %s',
      (reason, detail) => {
        render(
          <ClubGrowthAchievementCard
            programYear={PY}
            asOfDate="2026-10-31"
            checkpointReads={[
              read('september', {
                status: 'unavailable',
                unavailableReason: reason,
              }),
              read('march'),
            ]}
            toDateCount={2}
          />
        )

        const sep = sepBlock()
        expect(sep).toHaveAttribute('data-status', 'unknown')
        const message = within(sep).getByTestId(
          'club-growth-checkpoint-september30-unavailable'
        )
        expect(message).toHaveTextContent(/not available/i)
        expect(message).toHaveTextContent(detail)

        // The failure shape this card exists to prevent: a data gap must not
        // become a number, and must not read as "did not earn".
        expect(
          within(sep).queryByTestId('club-growth-checkpoint-september30-count')
        ).toBeNull()
        expect(within(sep).queryByText(/milestone earned/i)).toBeNull()
        expect(within(sep).queryByText(/no milestone/i)).toBeNull()
        expect(sep).not.toHaveTextContent(/\b0\b/)
      }
    )

    it('marks every milestone chip unavailable, not unreached', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-10-31"
          checkpointReads={[
            read('september', {
              status: 'unavailable',
              unavailableReason: 'snapshot-missing',
            }),
            read('march'),
          ]}
          toDateCount={2}
        />
      )

      const sep = sepBlock()
      for (const milestone of [3, 5]) {
        expect(
          within(sep).getByTestId(
            `club-growth-milestone-september30-${milestone}`
          )
        ).toHaveAttribute('data-state', 'unavailable')
      }
    })

    it('is unavailable — not zero — when the live running total is missing', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={bothPending}
          toDateCount={null}
        />
      )

      const sep = sepBlock()
      expect(sep).toHaveAttribute('data-status', 'unknown')
      expect(
        within(sep).queryByTestId('club-growth-checkpoint-september30-count')
      ).toBeNull()
    })
  })

  describe('slot reservation (#1105 / Lessons 107, 125, 158)', () => {
    it('renders a structural skeleton while the reads are loading', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={[
            read('september', { status: 'loading' }),
            read('march', { status: 'loading' }),
          ]}
          isLoading
        />
      )

      const skeleton = screen.getByTestId('club-growth-achievement-skeleton')
      expect(skeleton).toBeInTheDocument()
      // Same outer chrome as the loaded panel, so the swap doesn't shift.
      expect(skeleton).toHaveClass('redesign-panel')
      expect(
        within(skeleton).getAllByTestId('club-growth-skeleton-checkpoint')
      ).toHaveLength(2)
    })

    it('never collapses to null once the program year is applicable', () => {
      // Every checkpoint unavailable AND no live count: the emptiest state
      // the card can reach. It still occupies its slot.
      const { container } = render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2027-06-30"
          checkpointReads={[
            read('september', {
              status: 'unavailable',
              unavailableReason: 'snapshot-missing',
            }),
            read('march', {
              status: 'unavailable',
              unavailableReason: 'snapshot-missing',
            }),
          ]}
          toDateCount={null}
        />
      )

      expect(container.firstChild).not.toBeNull()
      expect(screen.getByTestId('club-growth-achievement')).toHaveClass(
        'redesign-panel'
      )
    })

    it('reserves the slot when no checkpoint reads have arrived at all', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={[]}
          isLoading
        />
      )
      expect(
        screen.getByTestId('club-growth-achievement-skeleton')
      ).toBeInTheDocument()
    })
  })

  describe('methodology link', () => {
    it('links the rule-change log entry for this achievement', () => {
      render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={bothPending}
          toDateCount={1}
        />
      )

      expect(
        screen.getByRole('link', { name: /how this is measured/i })
      ).toHaveAttribute(
        'href',
        '/methodology#py-2026-2027-district-club-growth-achievement'
      )
    })
  })

  describe('accessibility', () => {
    it('has no axe violations in the pending state', async () => {
      const { container } = render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-08-31"
          checkpointReads={bothPending}
          toDateCount={1}
        />
      )
      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations in the settled + unavailable mix', async () => {
      const { container } = render(
        <ClubGrowthAchievementCard
          programYear={PY}
          asOfDate="2026-10-31"
          checkpointReads={[
            read('september', {
              status: 'resolved',
              newCharteredClubs: 5,
              resolvedFromDate:
                SEP_DATE as ClubGrowthCheckpointRead['resolvedFromDate'],
              asOfDate: SEP_DATE,
            }),
            read('march', {
              status: 'unavailable',
              unavailableReason: 'district-absent',
            }),
          ]}
          toDateCount={5}
        />
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
