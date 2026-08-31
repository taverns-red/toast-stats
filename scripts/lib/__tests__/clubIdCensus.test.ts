/**
 * Unit tests for the club-id census (#1450).
 *
 * The census answers ONE unverified question: does any real Toastmasters club
 * id contain a non-digit? Everything decided here is pure — file reading lives
 * in the CLI at the bottom of `../clubIdCensus.ts` — so the answer the CI run
 * prints is produced by logic that is covered here.
 *
 * The collision half is deliberately parameterised on the normalizer. The
 * shipped `normalizeClubId` rule is in flux (#1437 vs #1440 shipped opposing
 * rules), and a test that pins grouping behaviour to whichever one is on
 * `main` today would break for the wrong reason tomorrow. The grouping logic
 * is tested against an injected stub; ONE test pins the default to the shipped
 * rule using a case both rules agree on (`0012` ≡ `12`).
 */

import { describe, expect, it } from 'vitest'
import {
  buildClubIdCensus,
  collectClubIdOccurrences,
  formatClubIdCensus,
  readSnapshotVintage,
  type ClubIdOccurrence,
  type SnapshotVintage,
} from '../clubIdCensus.js'

/** A per-district snapshot file body, in the shape the archive stores. */
function districtFile(options: {
  status?: string
  clubPerformance?: Array<Record<string, unknown>>
  clubs?: Array<Record<string, unknown>>
}): unknown {
  return {
    status: options.status ?? 'success',
    data: {
      clubPerformance: options.clubPerformance ?? [],
      clubs: options.clubs ?? [],
    },
  }
}

describe('collectClubIdOccurrences', () => {
  it('reads the club id from clubPerformance rows', () => {
    const occurrences = collectClubIdOccurrences(
      'district_61.json',
      districtFile({
        clubPerformance: [
          { 'Club Number': '00009905', 'Club Name': 'Early Birds' },
          { 'Club Number': '1234', 'Club Name': 'Toastmasters 1234' },
        ],
      })
    )

    expect(occurrences).toEqual([
      {
        rawId: '00009905',
        districtId: '61',
        source: 'clubPerformance',
        clubName: 'Early Birds',
      },
      {
        rawId: '1234',
        districtId: '61',
        source: 'clubPerformance',
        clubName: 'Toastmasters 1234',
      },
    ])
  })

  it('falls back through the same column names the transformer tries', () => {
    // DataTransformer.buildClubStatistics reads
    // `extractString(record, 'Club Number', 'ClubId', 'Club')`. The census
    // has to see every id the transformer sees, or a non-digit id hiding in
    // an alternate column would be reported as "none found".
    const occurrences = collectClubIdOccurrences(
      'district_F.json',
      districtFile({
        clubPerformance: [
          { ClubId: '4521' },
          { Club: '7788' },
          { 'Club Number': '', ClubId: '9001' },
        ],
      })
    )

    expect(occurrences.map(o => o.rawId)).toEqual(['4521', '7788', '9001'])
    expect(occurrences.every(o => o.districtId === 'F')).toBe(true)
  })

  it('reads clubs[].clubId — the field club-index.json is keyed on', () => {
    const occurrences = collectClubIdOccurrences(
      'district_61.json',
      districtFile({
        clubs: [{ clubId: '00003045', clubName: 'Sunrise Speakers' }],
      })
    )

    expect(occurrences).toEqual([
      {
        rawId: '00003045',
        districtId: '61',
        source: 'clubs',
        clubName: 'Sunrise Speakers',
      },
    ])
  })

  it('skips the daily-reports sidecar, not just files named _reports', () => {
    // The shared matcher (#1428) owns this distinction — the census must not
    // re-derive it. `district_61_reports.json` is a DistrictReportsDataset,
    // and any future `district_61_foo.json` sidecar is excluded too.
    const body = districtFile({ clubPerformance: [{ 'Club Number': '1' }] })
    expect(collectClubIdOccurrences('district_61_reports.json', body)).toEqual(
      []
    )
    expect(collectClubIdOccurrences('district_61_foo.json', body)).toEqual([])
    expect(collectClubIdOccurrences('metadata.json', body)).toEqual([])
  })

  it('skips a failed district file', () => {
    const occurrences = collectClubIdOccurrences(
      'district_99.json',
      districtFile({
        status: 'failed',
        clubPerformance: [{ 'Club Number': '1234' }],
      })
    )
    expect(occurrences).toEqual([])
  })

  it('ignores empty, whitespace-only and non-string id cells', () => {
    const occurrences = collectClubIdOccurrences(
      'district_61.json',
      districtFile({
        clubPerformance: [
          { 'Club Number': '' },
          { 'Club Number': '   ' },
          { 'Club Number': null },
          { 'Club Number': 4242 },
          { 'Club Number': ' 1234 ' },
        ],
      })
    )

    // A numeric cell is a real id that JSON happened to type as a number —
    // it counts, stringified. Whitespace is trimmed, blanks are dropped.
    expect(occurrences.map(o => o.rawId)).toEqual(['4242', '1234'])
  })

  it('survives a file whose shape is not a district snapshot at all', () => {
    expect(collectClubIdOccurrences('district_61.json', null)).toEqual([])
    expect(collectClubIdOccurrences('district_61.json', { data: 3 })).toEqual(
      []
    )
    expect(collectClubIdOccurrences('district_61.json', 'nope')).toEqual([])
  })
})

/** Shorthand occurrence builder for the census tests. */
function occ(
  rawId: string,
  districtId = '61',
  clubName?: string
): ClubIdOccurrence {
  return {
    rawId,
    districtId,
    source: 'clubPerformance',
    ...(clubName === undefined ? {} : { clubName }),
  }
}

describe('buildClubIdCensus — non-digit scan', () => {
  it('counts every id and every distinct raw form', () => {
    const census = buildClubIdCensus([
      occ('1234'),
      occ('1234', '62'),
      occ('5678'),
    ])
    expect(census.totalIds).toBe(3)
    expect(census.distinctRawIds).toBe(2)
  })

  it('reports nothing when every id is digits only', () => {
    const census = buildClubIdCensus([occ('00001234'), occ('9905')])
    expect(census.nonDigit).toEqual([])
  })

  it('reports the actual id, its count and where it was seen', () => {
    const census = buildClubIdCensus([
      occ("'180"),
      occ("'180", '62'),
      occ('Club 42'),
      occ('A12'),
      occ('1234'),
    ])

    expect(census.nonDigit.map(f => f.rawId)).toEqual([
      "'180",
      'A12',
      'Club 42',
    ])
    const apostrophe = census.nonDigit.find(f => f.rawId === "'180")
    expect(apostrophe?.count).toBe(2)
    expect(apostrophe?.districts).toEqual(['61', '62'])
  })
})

describe('buildClubIdCensus — canonical collisions', () => {
  /** Groups by the first character, so `A12` and `A99` collide. */
  const firstChar = (id: string): string => id.slice(0, 1)

  it('reports no collision when distinct ids stay distinct', () => {
    const census = buildClubIdCensus([occ('1234'), occ('5678')], {
      normalize: id => id,
    })
    expect(census.collisions).toEqual([])
  })

  it('does not call one id seen many times a collision', () => {
    const census = buildClubIdCensus(
      [occ('1234'), occ('1234', '62'), occ('1234', '63')],
      { normalize: id => id }
    )
    expect(census.collisions).toEqual([])
  })

  it('flags a padding-only group as benign, not substantive', () => {
    // `0012` and `12` are the SAME club in two lexical forms — the exact
    // thing normalization exists to reconcile. Reporting it as a data-
    // integrity finding would bury the real signal in noise.
    const census = buildClubIdCensus([occ('0012'), occ('12')], {
      normalize: id => id.replace(/^0+/, ''),
    })

    expect(census.collisions).toHaveLength(1)
    expect(census.collisions[0]?.canonical).toBe('12')
    expect(census.collisions[0]?.rawIds).toEqual(['0012', '12'])
    expect(census.collisions[0]?.substantive).toBe(false)
  })

  it('flags a group differing by more than leading zeros as substantive', () => {
    const census = buildClubIdCensus(
      [
        occ('A12', '61', 'Alpha Club'),
        occ('A99', '62', 'Ninety-Nine Club'),
        occ('A12', '61', 'Alpha Club'),
      ],
      { normalize: firstChar }
    )

    expect(census.collisions).toHaveLength(1)
    const collision = census.collisions[0]
    expect(collision?.canonical).toBe('A')
    expect(collision?.rawIds).toEqual(['A12', 'A99'])
    expect(collision?.substantive).toBe(true)
    // The club names are what let an operator tell "two lexical forms of one
    // club" from "two different clubs sharing a key" at a glance.
    expect(collision?.clubNames).toEqual(['Alpha Club', 'Ninety-Nine Club'])
    expect(collision?.districts).toEqual(['61', '62'])
  })

  it('sorts substantive collisions ahead of benign ones', () => {
    const census = buildClubIdCensus(
      [occ('0012'), occ('12'), occ('A12'), occ('A99')],
      {
        normalize: id =>
          /^\d+$/.test(id) ? id.replace(/^0+/, '') : firstChar(id),
      }
    )

    expect(census.collisions.map(c => c.substantive)).toEqual([true, false])
  })

  it('defaults to the shipped normalizeClubId rule', () => {
    // Both candidate rules agree that leading zeros are stripped, so this
    // assertion holds whichever one is on `main`. It exists to prove the
    // census uses the SHIPPED rule rather than a private copy of it — the
    // collision it reports is the collision the pipeline would write.
    const census = buildClubIdCensus([occ('0012'), occ('12')])
    expect(census.collisions.map(c => c.rawIds)).toEqual([['0012', '12']])
  })
})

describe('formatClubIdCensus', () => {
  const cleanYear = {
    programYear: '2021-2022',
    snapshotDate: '2022-06-30',
    districtFiles: 106,
    census: buildClubIdCensus([occ('1234'), occ('5678', '62')]),
  }

  it('says so plainly when nothing was found', () => {
    const text = formatClubIdCensus([cleanYear])
    expect(text).toContain('2021-2022')
    expect(text).toContain('2022-06-30')
    expect(text).toContain('106')
    expect(text).toMatch(/no club id contains a non-digit/i)
  })

  it('prints the actual offending ids, not just a count', () => {
    const text = formatClubIdCensus([
      {
        ...cleanYear,
        census: buildClubIdCensus([occ("'180"), occ('Club 42'), occ('A12')]),
      },
    ])

    expect(text).toContain("'180")
    expect(text).toContain('Club 42')
    expect(text).toContain('A12')
  })

  it('caps the printed sample and says that it truncated', () => {
    const many = Array.from({ length: 40 }, (_, i) => occ(`A${i}`))
    const text = formatClubIdCensus(
      [{ ...cleanYear, census: buildClubIdCensus(many) }],
      { sampleLimit: 5 }
    )

    expect(text).toMatch(/showing 5 of 40/i)
    // A silent truncation reads as "that's all of them" — the total has to
    // appear next to the sample.
    expect(text).toContain('40')
  })

  it('groups the findings by program year', () => {
    const text = formatClubIdCensus([
      cleanYear,
      {
        programYear: '2022-2023',
        snapshotDate: '2023-06-30',
        districtFiles: 110,
        census: buildClubIdCensus([occ("'999")]),
      },
    ])

    const firstYear = text.indexOf('2021-2022')
    const secondYear = text.indexOf('2022-2023')
    expect(firstYear).toBeGreaterThanOrEqual(0)
    expect(secondYear).toBeGreaterThan(firstYear)
    expect(text.indexOf("'999")).toBeGreaterThan(secondYear)
  })

  it('names the years scanned even when none of them had a snapshot', () => {
    expect(formatClubIdCensus([])).toMatch(/no snapshot/i)
  })
})

/* ── Archive vintage (#1464) ────────────────────────────────────────────────
   The oracle's 11 remaining mismatches were hypothesised to be pre-final
   year-end captures. Refuting that took a bespoke investigation reading
   sourceCsvDate / calculatedAt / collectedAt out of the archive by hand. It
   should have been one line of the census's own output — reported ALONGSIDE
   the oracle's verdict, never as it. */

describe('readSnapshotVintage (#1464)', () => {
  it('takes sourceCsvDate and calculatedAt from the date’s rankings metadata', () => {
    const vintage = readSnapshotVintage({
      rankings: {
        metadata: {
          sourceCsvDate: '2022-07-25',
          calculatedAt: '2026-06-11T11:12:42.977Z',
        },
      },
      districtFiles: [],
    })

    expect(vintage.sourceCsvDate).toBe('2022-07-25')
    expect(vintage.calculatedAt).toBe('2026-06-11T11:12:42.977Z')
  })

  it('collects the distinct collectedAt stamps across district files', () => {
    const vintage = readSnapshotVintage({
      rankings: undefined,
      districtFiles: [
        { collectedAt: '2026-06-11T11:12:41.779Z' },
        { collectedAt: '2026-06-11T11:12:41.779Z' },
        { collectedAt: '2026-06-11T11:13:02.001Z' },
        {},
      ],
    })

    expect(vintage.collectedAt).toEqual([
      '2026-06-11T11:12:41.779Z',
      '2026-06-11T11:13:02.001Z',
    ])
    expect(vintage.districtFilesWithCollectedAt).toBe(3)
  })

  it('leaves an absent field absent rather than inventing one', () => {
    const vintage = readSnapshotVintage({
      rankings: { metadata: {} },
      districtFiles: [{}],
    })

    expect(vintage.sourceCsvDate).toBeUndefined()
    expect(vintage.calculatedAt).toBeUndefined()
    expect(vintage.collectedAt).toEqual([])
  })
})

describe('formatClubIdCensus — archive vintage (#1464)', () => {
  const yearWith = (vintage: SnapshotVintage) => ({
    programYear: '2021-2022',
    snapshotDate: '2022-06-30',
    districtFiles: 106,
    census: buildClubIdCensus([occ('1234')]),
    vintage,
  })

  it('reports all three vintage fields for the program year', () => {
    const text = formatClubIdCensus([
      yearWith({
        sourceCsvDate: '2022-07-25',
        calculatedAt: '2026-06-11T11:12:42.977Z',
        collectedAt: ['2026-06-11T11:12:41.779Z'],
        districtFilesWithCollectedAt: 106,
      }),
    ])

    expect(text).toContain('sourceCsvDate 2022-07-25')
    expect(text).toContain('calculatedAt 2026-06-11T11:12:42.977Z')
    expect(text).toContain('collectedAt 2026-06-11T11:12:41.779Z')
  })

  it('shows the range when district files were collected at different times', () => {
    const text = formatClubIdCensus([
      yearWith({
        sourceCsvDate: '2026-07-30',
        calculatedAt: '2026-07-31T14:53:11.996Z',
        collectedAt: [
          '2026-07-31T14:53:10.478Z',
          '2026-07-31T14:53:11.080Z',
          '2026-07-31T14:53:11.400Z',
        ],
        districtFilesWithCollectedAt: 94,
      }),
    ])

    expect(text).toContain('2026-07-31T14:53:10.478Z')
    expect(text).toContain('2026-07-31T14:53:11.400Z')
    expect(text).toMatch(/3 distinct/)
  })

  it('says a field is absent rather than printing a blank', () => {
    const text = formatClubIdCensus([
      yearWith({
        sourceCsvDate: undefined,
        calculatedAt: undefined,
        collectedAt: [],
        districtFilesWithCollectedAt: 0,
      }),
    ])

    expect(text).toMatch(/sourceCsvDate absent/)
    expect(text).toMatch(/collectedAt absent/)
  })

  it('reports the vintage alongside the club-id verdict, never as it', () => {
    const text = formatClubIdCensus([
      yearWith({
        sourceCsvDate: '2022-07-25',
        calculatedAt: '2026-06-11T11:12:42.977Z',
        collectedAt: ['2026-06-11T11:12:41.779Z'],
        districtFilesWithCollectedAt: 106,
      }),
    ])

    // The verdict line still speaks only about club ids.
    const verdict = text.split('\n')[1]!
    expect(verdict).toMatch(/^VERDICT:/)
    expect(verdict).not.toMatch(/sourceCsvDate|collectedAt|calculatedAt/)
  })

  it('still formats a census that carries no vintage at all', () => {
    const text = formatClubIdCensus([
      {
        programYear: '2021-2022',
        snapshotDate: '2022-06-30',
        districtFiles: 106,
        census: buildClubIdCensus([occ('1234')]),
      },
    ])

    expect(text).toContain('2021-2022')
  })
})
