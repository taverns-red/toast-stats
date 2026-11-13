import { describe, it, expect } from 'vitest'
import { resolveClubParent } from '../clubParent'

describe('resolveClubParent (#2646)', () => {
  it('defaults to the clubs list', () => {
    expect(resolveClubParent('61', null)).toEqual({
      label: 'Clubs',
      to: '/district/61/clubs',
    })
  })

  it('restores the clubs list filters it was opened from (#577)', () => {
    expect(
      resolveClubParent('61', { fromClubsSearch: '?status=vulnerable' }).to
    ).toBe('/district/61/clubs?status=vulnerable')
  })

  it('prefers the area or division it was opened from', () => {
    const fromEntity = {
      label: 'Area A1',
      to: '/district/61/division/A/area/A1',
    }
    expect(
      resolveClubParent('61', { fromEntity, fromClubsSearch: '?x=1' })
    ).toEqual(fromEntity)
  })

  it.each([
    ['an external URL', { label: 'x', to: 'https://example.com/' }],
    ['another district', { label: 'x', to: '/district/7/division/A' }],
    ['an empty label', { label: '', to: '/district/61/division/A' }],
    ['a non-string target', { label: 'x', to: 3 }],
  ])('ignores a fromEntity with %s', (_name, fromEntity) => {
    expect(resolveClubParent('61', { fromEntity }).to).toBe(
      '/district/61/clubs'
    )
  })
})
