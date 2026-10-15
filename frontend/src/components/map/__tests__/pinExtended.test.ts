/**
 * Extended pin colour modes (#1787, spec §4.2): TI club status, members,
 * net growth, DCP goals and club age. Each mode bins one snapshot field,
 * draws a non-colour channel (shape, fill level or direction), says its
 * category in words, and never turns a missing value into a false 0.
 */
import { describe, expect, it } from 'vitest'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import {
  EXTENDED_FACET_PARAMS,
  applyExtendedFacets,
  extendedModel,
} from '../pinExtended'
import { legendChips } from '../pinModes'
import { buildPinFeatures, clubPinLayers } from '../pinLayer'
import { pinTargets } from '../pinTargets'

const club = (o: Partial<ClubTrend>): ClubTrend =>
  ({
    clubId: '1',
    clubName: 'Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '01',
    areaName: 'Area 01',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    coordinates: { lat: 45, lng: -75 },
    ...o,
  }) as ClubTrend

const members = (n: number) => [
  { date: '2026-07-01', count: 1 },
  { date: '2026-10-11', count: n },
]
const goals = (n: number) => [{ date: '2026-10-11', goalsAchieved: n }]
const DATE = '2026-10-11'

const label = (mode: Parameters<typeof extendedModel>[0], c: ClubTrend) =>
  extendedModel(mode, DATE).categoryOf(c).label

describe('membership size (?color=size)', () => {
  it('bins the latest count on the 8 / 12 / 20 / 30 lines, in words', () => {
    const at = (n: number) =>
      label('size', club({ membershipTrend: members(n) }))
    expect(at(0)).toBe('0–7 members')
    expect(at(7)).toBe('0–7 members')
    expect(at(8)).toBe('8–11 members')
    expect(at(12)).toBe('12–19 members')
    expect(at(20)).toBe('20–29 members')
    expect(at(30)).toBe('30 or more members')
  })

  it('is "Not available" without a membership count, never 0–7', () => {
    expect(label('size', club({ membershipTrend: [] }))).toBe(
      'Not available for this date'
    )
  })

  it('fills the pin more as the club grows (fill level, not colour alone)', () => {
    const shapes = extendedModel('size', DATE)
      .categories.slice(0, 5)
      .map(c => c.shape)
    expect(shapes).toEqual(['fill0', 'fill25', 'fill50', 'fill75', 'fill100'])
  })
})

describe('net growth since July (?color=growth)', () => {
  const at = (count: number, base: number | undefined) =>
    label(
      'growth',
      club({ membershipTrend: members(count), membershipBase: base })
    )

  it('bins count − base on a diverging scale with direction shapes', () => {
    expect(at(10, 15)).toBe('Down 5 or more')
    expect(at(10, 11)).toBe('Down 1 to 4')
    expect(at(10, 10)).toBe('No change')
    expect(at(12, 10)).toBe('Up 1 to 2')
    expect(at(13, 10)).toBe('Up 3 or more')
    const shapes = extendedModel('growth', DATE)
      .categories.slice(0, 5)
      .map(c => c.shape)
    expect(shapes).toEqual(['down', 'downHalf', 'circle', 'upHalf', 'up'])
  })

  it('is "Not available" without a July base, never "No change"', () => {
    expect(at(10, undefined)).toBe('Not available for this date')
  })
})

describe('DCP goals met (?color=dcp)', () => {
  it('bins on the tier lines', () => {
    const at = (n: number) => label('dcp', club({ dcpGoalsTrend: goals(n) }))
    expect([0, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(at)).toEqual([
      '0–2 goals',
      '0–2 goals',
      '3–4 goals',
      '3–4 goals',
      '5–6 goals',
      '5–6 goals',
      '7–8 goals',
      '7–8 goals',
      '9–10 goals',
      '9–10 goals',
    ])
  })

  it('is "Not available" without DCP data, never 0–2', () => {
    expect(label('dcp', club({ dcpGoalsTrend: [] }))).toBe(
      'Not available for this date'
    )
  })
})

describe('club age (?color=age)', () => {
  it('measures age at the viewed snapshot date, not today', () => {
    const c = club({ charterDate: '2025-11-01' })
    expect(extendedModel('age', '2026-10-11').categoryOf(c).label).toBe(
      'Under 1 year old'
    )
    expect(extendedModel('age', '2036-10-11').categoryOf(c).label).toBe(
      '10–24 years old'
    )
  })

  it('bins 1–2, 3–9, 10–24 and 25+ years', () => {
    const at = (d: string) => label('age', club({ charterDate: d }))
    expect(at('2024-10-11')).toBe('1–2 years old')
    expect(at('2020-01-01')).toBe('3–9 years old')
    expect(at('2001-10-11')).toBe('25 years or more')
  })

  it('is "Not available" without a charter date', () => {
    expect(label('age', club({}))).toBe('Not available for this date')
  })
})

describe('TI club status (?color=status)', () => {
  it('reads the read-time renewal overlay before the frozen base', () => {
    const renewed = club({
      clubStatus: 'Suspended',
      statusOverlay: {
        status: 'Active',
        source: 'dues-renewal',
        activeSince: '2026-10-01',
        asOf: '',
      },
    })
    expect(label('status', renewed)).toBe('Active')
  })

  it('names each TI status with a distinct shape', () => {
    expect(label('status', club({ clubStatus: 'Low' }))).toBe('Low')
    expect(label('status', club({ clubStatus: 'Ineligible' }))).toBe(
      'Ineligible'
    )
    expect(label('status', club({ clubStatus: 'Suspended' }))).toBe('Suspended')
    const shapes = extendedModel('status', DATE).categories.map(c => c.shape)
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it('is "Not available" when the snapshot has no status', () => {
    expect(label('status', club({ clubStatus: undefined }))).toBe(
      'Not available for this date'
    )
  })
})

describe('shared states', () => {
  it('suspended overrides every binned mode', () => {
    const c = club({ clubStatus: 'Suspended', membershipTrend: members(25) })
    for (const m of ['size', 'growth', 'dcp', 'age'] as const)
      expect(label(m, c)).toBe('Suspended')
  })

  it('"Not available" is a hollow-ring shape, not a fill', () => {
    const na = extendedModel('size', DATE).categoryOf(club({}))
    expect(na.shape).toBe('na')
  })

  it('ordinal legends keep every rung but hide empty N/A and Suspended', () => {
    const chips = legendChips(extendedModel('size', DATE), [
      club({ membershipTrend: members(9) }),
    ])
    expect(chips.map(c => `${c.label} ${c.count}`)).toEqual([
      '0–7 members 0',
      '8–11 members 1',
      '12–19 members 0',
      '20–29 members 0',
      '30 or more members 0',
    ])
  })

  it('clusters never take the N/A or Suspended fill as a rung', () => {
    const model = extendedModel('size', DATE)
    const layer = clubPinLayers(model, 'light')[0]!
    const json = JSON.stringify(layer)
    // The median-rung expression counts only the five rungs.
    for (const key of ['na', 'suspended']) {
      const i = model.categories.findIndex(c => c.key === key)
      expect(i).toBeGreaterThan(4)
      expect(json).not.toContain(`"k${i}"`)
    }
    expect(json).toContain('"k4"')
    // The pin draws with its category index and shape.
    const f = buildPinFeatures([club({ membershipTrend: members(31) })], model)
    expect(f.features[0]!.properties).toMatchObject({ s: 'fill100', k: 4 })
  })
})

describe('legend-chip facets (one key per mode)', () => {
  const clubs = [
    club({ clubId: 'a', membershipTrend: members(5), clubStatus: 'Low' }),
    club({ clubId: 'b', membershipTrend: members(22), clubStatus: 'Active' }),
    club({ clubId: 'c', membershipTrend: [], clubStatus: 'Active' }),
  ]

  it('each mode writes its own key; TI status reuses the Clubs-table ?clubStatus=', () => {
    expect(EXTENDED_FACET_PARAMS).toEqual([
      'clubStatus',
      'size',
      'growth',
      'dcp',
      'age',
      'renew-oct',
      'renew-apr',
      'csp',
      'officers',
      'coach',
      'awards',
      'attendance',
    ])
    expect(extendedModel('status', DATE).facet?.param).toBe('clubStatus')
    expect(extendedModel('size', DATE).facet?.param).toBe('size')
  })

  it('filters by the URL keys, AND across keys, OR within', () => {
    const ids = (q: string) =>
      applyExtendedFacets(clubs, new URLSearchParams(q), DATE).map(
        c => c.clubId
      )
    expect(ids('size=0-7,20-29')).toEqual(['a', 'b'])
    expect(ids('size=na')).toEqual(['c'])
    expect(ids('size=20-29&clubStatus=Low')).toEqual([])
    expect(ids('clubStatus=Active')).toEqual(['b', 'c'])
    expect(ids('')).toEqual(['a', 'b', 'c'])
  })
})

describe('pin names (#1966 keyboard path)', () => {
  it("a pin is named by club and the active mode's category, in words", () => {
    const model = extendedModel('size', DATE)
    const c = club({
      clubId: '7',
      clubName: 'Alpha',
      membershipTrend: members(9),
    })
    const [f] = buildPinFeatures([c], model).features
    const [t] = pinTargets(
      [{ geometry: f!.geometry, properties: { ...f!.properties } }],
      ([x, y]) => ({ x, y }),
      [c],
      model
    )
    expect(t!.label).toBe('Alpha, 8–11 members')
  })
})
