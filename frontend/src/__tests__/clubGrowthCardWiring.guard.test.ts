/**
 * `ClubGrowthAchievementCard` wiring guard (#1476, epic #1473).
 *
 * The card is correct only if the page hands it the right four things, and
 * each of those is a rule that a future refactor can quietly break without
 * turning any component test red:
 *
 *  1. **R3** — `programYear` and `asOfDate` come from the parent's own state
 *     (`effectiveProgramYear` / `effectiveEndDate`), never re-derived inside
 *     the card from response data.
 *  2. The live running total is `districtRanking.newCharteredClubs` — the row
 *     from `useDistrictRanking(districtId, effectiveEndDate)`, which is scoped
 *     to the DISPLAYED date (#1396). A count read from "latest" under a past
 *     year's label is the #1396 failure repeated.
 *  3. `null`/absent stays `null` on the way in. Defaulting a missing count to
 *     `0` at the call site would defeat every "never render a gap as zero"
 *     assertion in the component's own suite.
 *  4. Once the program year is applicable the card has exactly ONE `return
 *     null` — the applicability gate. Any second one is a conditional-null
 *     render path, i.e. a slot that collapses and shifts the page when a
 *     separately-resolving query lands (Lessons 107, 125, 158).
 *
 * A source guard rather than a page mount: `frontend/tsconfig.json` excludes
 * the test tree, a full DistrictDetailPage mount costs ~seconds of the
 * integration budget, and the thing being protected here is a *call-site
 * shape*, which reading the call site checks directly. Same pattern as
 * `trophyCaseProgramYear.guard.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Comments describe what must NOT happen, so they must not count as code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const caller = stripComments(
  readFileSync(join(__dirname, '../pages/DistrictDetailPage.tsx'), 'utf-8')
)
const component = stripComments(
  readFileSync(
    join(__dirname, '../components/ClubGrowthAchievementCard.tsx'),
    'utf-8'
  )
)

describe('ClubGrowthAchievementCard wiring (#1476)', () => {
  it('is mounted on the District Overview hub', () => {
    expect(caller).toMatch(/<ClubGrowthAchievementCard/)
    expect(caller).toMatch(
      /import \{ ClubGrowthAchievementCard \} from '\.\.\/components\/ClubGrowthAchievementCard'/
    )
  })

  it('passes the program year and as-of date down as props (R3)', () => {
    expect(caller).toMatch(
      /programYear=\{\s*\(effectiveProgramYear \?\? selectedProgramYear\)\.label\s*\}/
    )
    expect(caller).toMatch(/asOfDate=\{effectiveEndDate \?\? undefined\}/)
  })

  it('feeds the live count from the date-scoped rankings row, un-defaulted', () => {
    expect(caller).toMatch(
      /toDateCount=\{districtRanking\?\.newCharteredClubs \?\? null\}/
    )
    // `?? 0` at the call site would turn "not available" into "chartered
    // nothing" before the card ever sees it.
    expect(caller).not.toMatch(/newCharteredClubs \?\? 0/)
  })

  it('resolves the checkpoints through the hook, not from current rankings', () => {
    expect(caller).toMatch(/useClubGrowthMilestones\(/)
    expect(caller).toMatch(/checkpointReads=\{clubGrowthCheckpoints\}/)
    expect(caller).toMatch(/isLoading=\{isLoadingClubGrowth\}/)
  })

  it('has exactly one null-render path in the card — the applicability gate', () => {
    // Scope to the exported render function; the pure string helpers above it
    // legitimately return null for "no provenance to show".
    const body = component.slice(
      component.indexOf('export const ClubGrowthAchievementCard')
    )
    expect(body).not.toHaveLength(0)
    expect(body.match(/return null/g) ?? []).toHaveLength(1)
    expect(body).toMatch(/if \(!result\.applicable\) return null/)
  })

  it('re-uses the shared predicate rather than re-deriving thresholds', () => {
    expect(component).toMatch(/resolveClubGrowthAchievement/)
    // The milestone tiers and checkpoint dates belong to the predicate; a
    // literal 3/5/10 tier list here is the drift Lesson 103 warns about.
    expect(component).not.toMatch(/\[\s*3\s*,\s*5\s*,\s*10\s*\]/)
    expect(component).not.toMatch(/'09-30'|'03-31'/)
  })
})
