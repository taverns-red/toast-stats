import { describe, expect, it } from 'vitest'
import { getScenario } from '../index'
import { FORM_FACTORS } from '../types'

/**
 * How-to video batch 2 (#2354): V5, V12 and V8 from the storyboard
 * (.routine-tmp/video-scenarios-2026-10-25.md §4).
 */
const BATCH = [
  {
    id: 'v5',
    role: 'Club Growth Director',
    start: '/district/114',
    link: 'ts.taverns.red/district/114/growth',
    hint: '114 = your district number',
  },
  {
    id: 'v12',
    role: 'Region Advisor',
    start: '/',
    link: 'ts.taverns.red/region/05',
    hint: '05 = your region number',
  },
  {
    id: 'v8',
    role: 'District Director',
    start: '/district/86',
    link: 'ts.taverns.red/district/86/changes',
    hint: '86 = your district number',
  },
] as const

describe.each(BATCH)(
  'scenario $id (#2354)',
  ({ id, role, start, link, hint }) => {
    const scenario = getScenario(id)

    it(`is for the ${role}`, () => {
      expect(scenario.id).toBe(id)
      expect(scenario.role).toContain(role)
    })

    it('renders in every form factor', () => {
      for (const format of FORM_FACTORS) {
        expect(scenario.forms[format], format).toBeDefined()
      }
    })

    it('captures the live site at a pinned snapshot, so retakes match', () => {
      const url = new URL(scenario.url)
      expect(url.origin).toBe('https://ts.taverns.red')
      const pinned = ['date', 'to'].some(k =>
        /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(k) ?? '')
      )
      expect(pinned, scenario.url).toBe(true)
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
