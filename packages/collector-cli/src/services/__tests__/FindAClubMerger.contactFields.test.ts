/**
 * #2026 — the Find-A-Club merge never writes club contact fields (email,
 * phone) into a snapshot, and strips any a legacy snapshot already carries.
 * The snapshot is a promoted, publicly served artifact; raw-fac/ is not.
 *
 * Real FAC shapes (normaliseTiClub reads `Email` / `Phone`), synthetic
 * placeholder values only.
 */
import { describe, it, expect } from 'vitest'
import { mergeFacIntoSnapshot } from '../FindAClubMerger.js'

const facClub = {
  Identification: { Id: { Value: '00000180' } },
  Address: { City: 'Ottawa', PrimaryRegion: { Value: 'ON' } },
  CountryName: 'Canada',
  Email: 'club-1@example.com',
  Phone: '+15550100001',
  Website: 'https://example.org/180',
  MeetingDay: 'Tuesday',
  IsProspective: false,
}

const prospectiveFacClub = {
  Identification: { Id: { Value: '00088888' }, Name: 'New ATO Toastmasters' },
  Address: { City: 'Toronto', PrimaryRegion: { Value: 'ON' } },
  CountryName: 'Canada',
  Email: 'club-2@example.com',
  Phone: '+15550100002',
  Website: 'https://example.org/88888',
  IsProspective: true,
}

const row = { 'Club Number': '00000180', 'Club Name': 'Ottawa Club' }
const parsed = { clubId: '180', clubName: 'Ottawa Club', membershipCount: 20 }

const records = (v: unknown) => (v ?? []) as Array<Record<string, unknown>>

describe('mergeFacIntoSnapshot — no club contact fields (#2026)', () => {
  const result = mergeFacIntoSnapshot(
    { districtId: '61', data: { clubPerformance: [row], clubs: [parsed] } },
    { Clubs: [facClub, prospectiveFacClub] }
  )
  const data = result.snapshot.data as Record<string, unknown>

  it('still enriches the matched club', () => {
    expect(result.matched).toBe(1)
    expect(records(data['clubs'])[0]?.['website']).toBe(
      'https://example.org/180'
    )
    expect(records(data['clubPerformance'])[0]?.['meetingDay']).toBe('Tuesday')
  })

  it('writes no email/phone onto clubPerformance[], clubs[] or prospectiveClubs[]', () => {
    for (const key of ['clubPerformance', 'clubs', 'prospectiveClubs']) {
      const list = records(data[key])
      expect(list.length).toBeGreaterThan(0)
      for (const r of list) {
        expect(r).not.toHaveProperty('email')
        expect(r).not.toHaveProperty('phone')
      }
    }
    expect(records(data['prospectiveClubs'])[0]?.['website']).toBe(
      'https://example.org/88888'
    )
  })

  it('strips contact fields a legacy snapshot already carries, matched or not', () => {
    const legacy = mergeFacIntoSnapshot(
      {
        districtId: '61',
        data: {
          clubPerformance: [
            { ...row, email: 'club-3@example.com', phone: '+15550100003' },
            { 'Club Number': '00099999', email: 'club-4@example.com' },
          ],
          clubs: [
            { ...parsed, email: 'club-3@example.com', phone: '+15550100003' },
            { clubId: '99999', phone: '+15550100004' },
          ],
        },
      },
      { Clubs: [facClub] }
    )
    const d = legacy.snapshot.data as Record<string, unknown>
    for (const key of ['clubPerformance', 'clubs']) {
      for (const r of records(d[key])) {
        expect(r).not.toHaveProperty('email')
        expect(r).not.toHaveProperty('phone')
      }
    }
  })
})
