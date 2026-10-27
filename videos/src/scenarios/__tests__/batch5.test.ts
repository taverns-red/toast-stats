import { describe, expect, it } from 'vitest'
import { getScenario } from '../index'
import { FORM_FACTORS } from '../types'
import { validateScenario } from '../validate'

/**
 * How-to video batch 5 (#2367): V13, V11 and V16, the last three in the
 * storyboard (.routine-tmp/video-scenarios-2026-10-25.md §4).
 */
const BATCH = [
  {
    id: 'v13',
    role: 'District PR Manager',
    start: '/district/86',
    link: 'ts.taverns.red/district/86',
    hint: '86 = your district number',
  },
  {
    id: 'v11',
    role: 'Club Growth Director',
    start: '/district/86',
    link: 'ts.taverns.red/district/86/meetings',
    hint: '86 = your district number',
  },
  {
    id: 'v16',
    role: 'Webmaster',
    start: '/district/86',
    link: 'ts.taverns.red/district/86/clubs?date=2026-09-30',
    hint: '86 = your district number; the date pins the snapshot',
  },
] as const

describe.each(BATCH)(
  'scenario $id (#2367)',
  ({ id, role, start, link, hint }) => {
    const scenario = getScenario(id)

    it(`is for the ${role}`, () => {
      expect(scenario.id).toBe(id)
      expect(scenario.role).toContain(role)
    })

    it('passes the validator: privacy, captions, timing, closing route', () => {
      expect(validateScenario(scenario)).toEqual([])
    })

    it('renders in every form factor', () => {
      for (const format of FORM_FACTORS) {
        expect(scenario.forms[format], format).toBeDefined()
      }
    })

    it('captures the live site at a pinned snapshot, so retakes match', () => {
      const url = new URL(scenario.url)
      expect(url.origin).toBe('https://ts.taverns.red')
      expect(url.searchParams.get('date') ?? '').toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('starts on a page the viewer already knows (Ron, PR #2356)', () => {
      expect(new URL(scenario.url).pathname).toBe(start)
    })

    it('ends on the deep link to the view, with what its number means', () => {
      expect(scenario.closing.caption).toContain(link)
      expect(scenario.closing.hint).toBe(hint)
    })

    it('uses the default generated music', () => {
      expect(scenario.music).toBe(getScenario('v2').music)
    })
  }
)

describe('V11 and V13 stay off club contact details (#2367)', () => {
  // Meeting times and club stories sit next to the data a viewer could
  // contact a club with. The clips may open a club page (the mask hides its
  // address and links) but must never open a Find-a-Club listing or an
  // external page.
  it.each(['v11', 'v13'])('%s never leaves ts.taverns.red', id => {
    const scenario = getScenario(id)
    for (const format of FORM_FACTORS) {
      const form = scenario.forms[format]
      if (!form) continue
      const selectors = [
        ...form.setup,
        ...Object.values(form.beats).flatMap(b => b.steps),
      ].flatMap(s => ('selector' in s ? [s.selector] : []))
      for (const selector of selectors) {
        expect(selector, `${format}: ${selector}`).not.toMatch(
          /https?:|target=|find-a-club|zoom|meet\.google|teams/i
        )
      }
    }
  })
})
