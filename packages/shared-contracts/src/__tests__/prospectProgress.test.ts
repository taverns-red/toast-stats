import { describe, it, expect } from 'vitest'
import {
  parseProspectChecklist,
  prospectProgress,
} from '../reports/reportsVocabulary.js'

/* #2388 — TI's `Prospect` cell is a checklist, not a ladder. Cells recorded
   from prod `snapshots/2026-10-27/district_{25,84}_reports.json` (section
   prospectiveClubs, prospect cell only — it carries no person data), plus the
   #2142 cell recorded on 2026-10-18 that lists steps without dates. */
const D25_28680093 =
  '#1 Application to Organize Complete - 04/17/2026#2 Certificate & Remit Incomplete - 08/14/2026#3 Roster Complete - 06/30/2026#4 Officer Info Complete - 06/15/2026#5 Club Info Complete - 06/15/2026#6 Constitution & Bylaws Complete - 06/15/2026Payment Complete - 04/17/2026'
const D25_28680358 =
  '#1 Application to Organize Complete - 06/03/2026#2 Certificate & Remit Incomplete - 06/04/2026#3 Roster Incomplete - 06/04/2026#4 Officer Info Complete - 06/04/2026#5 Club Info Complete - 06/04/2026#6 Constitution & Bylaws Incomplete - 06/04/2026Payment Complete - 06/03/2026'
const D84_28680214 =
  '#1 Application to Organize Complete - 05/08/2026#2 Certificate & Remit Incomplete - 05/11/2026#3 Roster Incomplete - 05/11/2026#4 Officer Info Incomplete - 05/11/2026#5 Club Info Incomplete - 05/11/2026#6 Constitution & Bylaws Incomplete - 05/11/2026Payment Complete - 05/08/2026'
const D84_28681056 =
  '#1 Application to Organize Complete - 10/05/2026Payment Incomplete'
const UNDATED_2142 =
  '#1 Application to Organize Complete - 03/12/2025#2 Certificate & Remit Incomplete #3 Roster Incomplete #4 Officer Info Complete - 06/02/2025#5 Club Info Complete - 04/25/2025#6 Constitution & Bylaws Complete - 06/02/2025Payment Complete - 03/17/2025'

describe('parseProspectChecklist', () => {
  it('lists all six steps and Payment, each with its own status and date', () => {
    const c = parseProspectChecklist(D25_28680093)
    expect(c).not.toBeNull()
    expect(c!.map(s => [s.key, s.status, s.date])).toEqual([
      ['1', 'complete', '2026-04-17'],
      ['2', 'incomplete', '2026-08-14'],
      ['3', 'complete', '2026-06-30'],
      ['4', 'complete', '2026-06-15'],
      ['5', 'complete', '2026-06-15'],
      ['6', 'complete', '2026-06-15'],
      ['payment', 'complete', '2026-04-17'],
    ])
    expect(c![1]!.label).toBe('Certificate & Remit')
  })

  it('marks steps TI does not print as not listed', () => {
    const c = parseProspectChecklist(D84_28681056)!
    expect(c.map(s => s.status)).toEqual([
      'complete',
      'not-listed',
      'not-listed',
      'not-listed',
      'not-listed',
      'not-listed',
      'incomplete',
    ])
    expect(c[6]!.date).toBeNull()
  })

  it('is null for text that is not the #N checklist', () => {
    expect(parseProspectChecklist('Something new from TI')).toBeNull()
  })
})

describe('prospectProgress (#2388)', () => {
  it('counts complete steps out of order; waits on the incomplete step', () => {
    // #2 went back to Incomplete on 08/14 while #3–#6 are Complete.
    expect(prospectProgress(D25_28680093)).toEqual({
      recognised: true,
      stepsComplete: 5,
      stepsTotal: 6,
      waitingOn: {
        number: 2,
        label: 'Certificate & Remit',
        listed: true,
        since: '2026-08-14',
        sinceFrom: 'step',
      },
      lastChanged: '2026-08-14',
      payment: 'complete',
      paymentDate: '2026-04-17',
    })
  })

  it('does not overstate a club that has only finished step #1', () => {
    // The #2142 rule showed this club as "Stage 6 · Constitution & Bylaws".
    expect(prospectProgress(D84_28680214)).toMatchObject({
      stepsComplete: 1,
      waitingOn: { number: 2, listed: true, since: '2026-05-11' },
    })
  })

  it('breaks a tie of oldest dates by the lowest step number', () => {
    expect(prospectProgress(D25_28680358)).toMatchObject({
      stepsComplete: 3,
      waitingOn: { number: 2, since: '2026-06-04' },
    })
  })

  it('an unlisted next step counts from the checklist’s latest step date', () => {
    expect(prospectProgress(D84_28681056)).toEqual({
      recognised: true,
      stepsComplete: 1,
      stepsTotal: 6,
      waitingOn: {
        number: 2,
        label: 'Certificate & Remit',
        listed: false,
        since: '2026-10-05',
        sinceFrom: 'checklist',
      },
      lastChanged: '2026-10-05',
      payment: 'incomplete',
      paymentDate: null,
    })
  })

  it('an incomplete step without a date counts from the latest step date', () => {
    expect(prospectProgress(UNDATED_2142)).toMatchObject({
      stepsComplete: 4,
      waitingOn: {
        number: 2,
        listed: true,
        since: '2025-06-02',
        sinceFrom: 'checklist',
      },
      lastChanged: '2025-06-02',
    })
  })

  it('an older dated step outranks an undated one, which counts from the latest', () => {
    const text =
      '#1 Application to Organize Complete - 07/01/2026#2 Certificate & Remit Incomplete #3 Roster Incomplete - 07/05/2026#4 Officer Info Complete - 07/09/2026Payment Complete - 07/01/2026'
    expect(prospectProgress(text)).toMatchObject({
      waitingOn: { number: 3, since: '2026-07-05' },
    })
  })

  it('all six complete: waiting on nothing', () => {
    const text =
      '#1 Application to Organize Complete - 04/17/2026#2 Certificate & Remit Complete - 08/20/2026#3 Roster Complete - 06/30/2026#4 Officer Info Complete - 06/15/2026#5 Club Info Complete - 06/15/2026#6 Constitution & Bylaws Complete - 06/15/2026Payment Incomplete'
    expect(prospectProgress(text)).toMatchObject({
      stepsComplete: 6,
      waitingOn: null,
      lastChanged: '2026-08-20',
      payment: 'incomplete',
    })
  })

  it('keeps unrecognised text raw instead of guessing', () => {
    expect(prospectProgress('Something new from TI')).toEqual({
      recognised: false,
      raw: 'Something new from TI',
    })
  })

  it('runs in linear time on hostile whitespace', () => {
    const t = performance.now()
    prospectProgress(`#1 a${' '.repeat(50_000)}x`)
    prospectProgress(`#1 ${' '.repeat(50_000)}Payment`)
    expect(performance.now() - t).toBeLessThan(200)
  })
})
