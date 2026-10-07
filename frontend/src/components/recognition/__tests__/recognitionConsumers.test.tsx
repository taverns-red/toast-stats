/**
 * Registry consumer sweep for the Club Growth Achievement (#1537).
 *
 * A surface that renders from an explicit list drops a category it does not
 * name — silently, never as an error (lesson: "a new event category is
 * dropped, not errored, by an explicit display list"). So adding the
 * achievement to the registry is only half the change: every consumer has to
 * either render it or pin, here, that leaving it out is deliberate.
 *
 *  | Consumer                      | Club Growth? | Why                                        |
 *  | ----------------------------- | ------------ | ------------------------------------------ |
 *  | ClubGrowthAchievementCard     | renders      | its glyph + accent come from the registry  |
 *  | AwardsRaceSection             | absent       | a competitive top-N race; this is a        |
 *  |                               |              | threshold — there is no leader to race     |
 *  | RecognitionFilterBar / filter | absent       | filters on competitive-award flags + tier; |
 *  |                               |              | a checkpoint verdict is a different query  |
 *  | DistrictTierChip              | absent       | the Distinguished ladder only              |
 *  | RecognitionLegend             | renders      | its own "Achievements" group               |
 *  | DistrictsPage rankings table  | renders      | badge with the tier reached, for holders   |
 *  |                               |              | (DistrictsPage.recognition.test.tsx)       |
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  CLUB_GROWTH_RECOGNITION,
  tierRecognition,
} from '../recognitionRegistry'
import { RecognitionLegend } from '../RecognitionLegend'
import { RecognitionFilterBar } from '../RecognitionFilterBar'
import { EMPTY_RECOGNITION_FILTER, parseAwardIds } from '../recognitionFilter'
import { AwardsRaceSection } from '../../AwardsRaceSection'
import type { CompetitiveAwardStandings } from '../../../services/cdn'

const CLUB_GROWTH = `[data-recognition="${CLUB_GROWTH_RECOGNITION.id}"]`

const emptyStandings: CompetitiveAwardStandings = {
  metadata: {
    snapshotId: '2026-09-30',
    calculatedAt: '2026-10-05T00:00:00.000Z',
    totalDistricts: 0,
  },
  extensionAward: [],
  twentyPlusAward: [],
  retentionAward: [],
} as unknown as CompetitiveAwardStandings

describe('recognition registry consumers — Club Growth Achievement (#1537)', () => {
  it('AwardsRaceSection: deliberately absent — a threshold has no race leader', () => {
    const { container } = render(
      <MemoryRouter>
        <AwardsRaceSection standings={emptyStandings} />
      </MemoryRouter>
    )
    expect(container.querySelector(CLUB_GROWTH)).toBeNull()
    expect(container.textContent).not.toContain(CLUB_GROWTH_RECOGNITION.title)
  })

  it('RecognitionFilterBar: deliberately absent — no chip filters on it', () => {
    const { container } = render(
      <RecognitionFilterBar
        filter={EMPTY_RECOGNITION_FILTER}
        onChange={() => undefined}
      />
    )
    expect(
      container.querySelector(
        `[data-testid="recognition-filter-${CLUB_GROWTH_RECOGNITION.id}"]`
      )
    ).toBeNull()
    expect(container.textContent).not.toContain(
      CLUB_GROWTH_RECOGNITION.shortLabel
    )
  })

  it('recognition filter URL codec: an achievement id is not an award token', () => {
    expect(parseAwardIds(CLUB_GROWTH_RECOGNITION.id)).toEqual([])
  })

  it('DistrictTierChip: deliberately absent — the achievement is not a tier', () => {
    expect(
      tierRecognition(CLUB_GROWTH_RECOGNITION.id as unknown as 'Smedley')
    ).toBeUndefined()
  })

  it('RecognitionLegend: renders it, in its own group', () => {
    const { container } = render(<RecognitionLegend />)
    expect(container.querySelector(CLUB_GROWTH)).not.toBeNull()
  })
})
