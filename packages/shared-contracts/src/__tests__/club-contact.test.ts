/**
 * Club contact fields never reach a promoted artifact (#2026).
 *
 * Synthetic placeholders only: no real address or number is ever fixtured.
 */
import { describe, it, expect } from 'vitest'
import {
  CLUB_CONTACT_KEYS,
  findClubContactField,
  omitClubContactFields,
} from '../index.js'

describe('CLUB_CONTACT_KEYS', () => {
  it('names email and phone', () => {
    expect([...CLUB_CONTACT_KEYS].sort()).toEqual(['email', 'phone'])
  })
})

describe('omitClubContactFields', () => {
  it('drops email and phone and keeps every other key', () => {
    const out = omitClubContactFields({
      clubId: '180',
      email: 'club-1@example.com',
      phone: '+15550100001',
      website: 'https://example.org/',
    })
    expect(out).toEqual({ clubId: '180', website: 'https://example.org/' })
    expect(out).not.toHaveProperty('email')
    expect(out).not.toHaveProperty('phone')
  })

  it('returns the same object when it carries no contact key', () => {
    const row = { clubId: '180', meetingDay: 'Tuesday' }
    expect(omitClubContactFields(row)).toBe(row)
  })

  it('passes non-objects through', () => {
    expect(omitClubContactFields(null)).toBeNull()
    expect(omitClubContactFields('x')).toBe('x')
  })
})

describe('findClubContactField', () => {
  it('names the path of a non-empty contact key, never its value', () => {
    const found = findClubContactField({
      data: {
        clubs: [{ clubId: '1' }, { clubId: '2', phone: '+15550100002' }],
      },
    })
    expect(found).toBe('data.clubs[1].phone')
    expect(found).not.toContain('555')
  })

  it('finds one nested in an analytics ClubTrend list', () => {
    expect(
      findClubContactField({
        data: { allClubs: [{ clubId: '1', email: 'club-1@example.com' }] },
      })
    ).toBe('data.allClubs[0].email')
  })

  it('ignores absent, empty and non-string contact keys', () => {
    expect(findClubContactField({ data: { clubs: [{ clubId: '1' }] } })).toBe(
      null
    )
    expect(findClubContactField({ clubs: [{ email: '', phone: '  ' }] })).toBe(
      null
    )
    expect(findClubContactField({ clubs: [{ email: null }] })).toBe(null)
  })
})
