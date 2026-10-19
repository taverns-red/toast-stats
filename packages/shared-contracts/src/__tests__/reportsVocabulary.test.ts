import { describe, expect, it } from 'vitest'

import {
  classifyDuesRenewal,
  parseProspectStage,
  sponsorMentorRole,
  usDateToIso,
} from '../index.js'

/**
 * #2012 — the daily-reports vocabulary, shared by the frontend's per-district
 * views (#1794, #1954) and the pipeline's region/world rollups, so a region
 * total and the district pages it sums can never read TI's text two ways.
 * Strings are the recorded live vocabulary (D61, prod
 * `snapshots/2026-10-15/district_61_reports.json`).
 */

describe('usDateToIso', () => {
  it('reads the first MM/DD/YYYY in the text', () => {
    expect(usDateToIso('Verified complete - 08/03/2026')).toBe('2026-08-03')
    expect(usDateToIso('Received - 5/7/2026')).toBe('2026-05-07')
    expect(usDateToIso('**Renewals not here**')).toBeNull()
  })
})

describe('parseProspectStage', () => {
  it('splits the stage from the run-on payment text', () => {
    expect(
      parseProspectStage(
        '#1 Application to Organize Complete - 04/15/2025Payment Complete - 04/19/2025'
      )
    ).toEqual({
      recognised: true,
      stageNumber: 1,
      stageLabel: 'Application to Organize',
      stageDate: '2025-04-15',
      payment: 'complete',
      paymentDate: '2025-04-19',
      raw: '#1 Application to Organize Complete - 04/15/2025Payment Complete - 04/19/2025',
    })
  })

  it('reads an incomplete payment', () => {
    expect(
      parseProspectStage(
        '#1 Application to Organize Complete - 03/21/2026Payment Incomplete'
      )
    ).toMatchObject({ recognised: true, payment: 'incomplete' })
  })

  it('reads a stage without a date, and a dash without spaces', () => {
    expect(parseProspectStage('#2 Charter Paperwork Incomplete')).toMatchObject(
      { recognised: true, stageNumber: 2, stageLabel: 'Charter Paperwork' }
    )
    expect(
      parseProspectStage('#3 Demo Meeting Complete-5/7/2026')
    ).toMatchObject({
      stageNumber: 3,
      stageLabel: 'Demo Meeting',
      stageDate: '2026-05-07',
    })
    expect(parseProspectStage('#1 ')).toMatchObject({ recognised: false })
  })

  it('runs in linear time on hostile whitespace (CodeQL js/polynomial-redos)', () => {
    const hostile = `#0 a${' '.repeat(50_000)}x`
    const t = performance.now()
    parseProspectStage(hostile)
    parseProspectStage(`#0 ${' '.repeat(50_000)}`)
    expect(performance.now() - t).toBeLessThan(200)
  })

  it('keeps unrecognised text raw instead of guessing', () => {
    expect(parseProspectStage('Something new from TI')).toEqual({
      recognised: false,
      raw: 'Something new from TI',
    })
  })
})

describe('sponsorMentorRole', () => {
  it('maps the four recorded codes, the U suffix included', () => {
    expect(sponsorMentorRole('SPONSOR')).toBe('sponsors')
    expect(sponsorMentorRole('SPONSORU')).toBe('sponsors')
    expect(sponsorMentorRole(' mentor ')).toBe('mentors')
    expect(sponsorMentorRole('MENTORU')).toBe('mentors')
  })

  it('never guesses an unknown code into a role', () => {
    expect(sponsorMentorRole('COACH')).toBe('other')
  })
})

describe('classifyDuesRenewal', () => {
  const at = (
    status: string,
    season: 'october' | 'april',
    snapshotDate = '2026-10-15'
  ) =>
    classifyDuesRenewal({
      status,
      season,
      programYear: '2026-2027',
      snapshotDate,
    })

  it('counts a verification inside the period window', () => {
    expect(at('Verified complete - 08/03/2026', 'october')).toBe('verified')
  })

  it('a verification left over from the last period is not received', () => {
    // The October window opens 1 June of the PY's first year.
    expect(at('Verified complete - 05/30/2026', 'october')).toBe('notReceived')
    expect(at('**Renewals not here**', 'october')).toBe('notReceived')
  })

  it('reads the minimum-not-met statuses', () => {
    expect(at('Low - Minimum requirement not yet met', 'october')).toBe('low')
    expect(at('Ineligible - Minimum requirement not yet met', 'october')).toBe(
      'ineligible'
    )
  })

  it('April is not yet due before 1 January of the PY second year', () => {
    expect(at('Verified complete - 01/20/2026', 'april')).toBe('notYetDue')
    expect(at('**Renewals not here**', 'april')).toBe('notYetDue')
    expect(at('Verified complete - 02/01/2027', 'april', '2027-02-10')).toBe(
      'verified'
    )
    expect(at('Verified complete - 01/20/2026', 'april', '2027-02-10')).toBe(
      'notReceived'
    )
  })

  it('keeps any other status as other, never a guess', () => {
    expect(at('Something new', 'october')).toBe('other')
  })
})
