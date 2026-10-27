import { describe, expect, it } from 'vitest'
import { getScenario } from '../index'
import { FORM_FACTORS } from '../types'

/**
 * How-to video batch 4 (#2363): V14, V10 and V9 from the storyboard
 * (.routine-tmp/video-scenarios-2026-10-25.md §4).
 */
const BATCH = [
  {
    id: 'v14',
    role: 'Club Growth Director',
    start: '/district/86',
    link: 'ts.taverns.red/district/86/clubs?status=intervention',
    hint: '86 = your district number',
  },
  {
    id: 'v10',
    role: 'District Director',
    start: '/district/86',
    link: 'ts.taverns.red/district/86/map?sandbox=1',
    hint: '86 = your district number',
  },
  {
    id: 'v9',
    role: 'District Director',
    start: '/district/86',
    link: 'ts.taverns.red/district/86/trends',
    hint: '86 = your district number',
  },
] as const

describe.each(BATCH)(
  'scenario $id (#2363)',
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
