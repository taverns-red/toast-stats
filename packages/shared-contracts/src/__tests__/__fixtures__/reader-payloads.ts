/**
 * Valid payloads for the reader-schema tolerance tests (#2493). The global
 * club race artifact is also the fixture of global-club-race.schema.test.ts;
 * the suspended-clubs and education payloads match their schema tests. The
 * other readers use the recorded `__fixtures__/*.json` files.
 */
import {
  EDUCATION_ROLLUP_VERSION,
  SUSPENDED_CLUBS_FORMAT,
  type EducationAwardsBlock,
  type EducationRollupProgramYear,
  type GlobalClubRace,
  type SuspendedClubs,
} from '../../index.js'

export const SUSPENDED_CLUBS: SuspendedClubs = {
  _format: SUSPENDED_CLUBS_FORMAT,
  snapshotDate: '2026-10-11',
  programYear: { start: '2026-07-01', end: '2027-06-30' },
  districts: {
    '61': [],
    '83': [
      {
        clubNumber: '1380016',
        clubName: 'Travelers Toastmasters',
        division: 'C',
        area: '33',
        suspendDate: '2026-10-01',
      },
    ],
  },
}

const block = (): EducationAwardsBlock => ({
  totals: { awards: 6, pathways: 3, legacy: 1, dtm: 1, other: 1 },
  pathwaysMatrix: { PM: [2, 1, 0, 0, 0] },
  legacyByCode: { CC: 1 },
  otherByCode: { PWMENTORPGM: 1 },
  clubsWithAward: 2,
  membersWithAward: null,
  tripleCrownAchievers: null,
})

export const EDUCATION_ROLLUP: EducationRollupProgramYear = {
  _format: { version: EDUCATION_ROLLUP_VERSION, type: 'education-rollup' },
  programYear: '2018-2019',
  source: 'ledger-history',
  sourceDate: null,
  districts: {
    '61': { status: 'available', region: '09', awards: block() },
    '17': { status: 'not-available', region: null, reason: 'no-data' },
  },
  regions: {
    '09': { ...block(), districtsAvailable: ['61'], districtsNotAvailable: [] },
  },
  regionsUnassigned: ['17'],
  world: {
    ...block(),
    districtsAvailable: ['61'],
    districtsNotAvailable: ['17'],
  },
}

const awards = { awards: 6, pathways: 3, legacy: 1, dtm: 1, other: 1 }

export const EDUCATION_ROLLUP_INDEX = {
  _format: {
    version: EDUCATION_ROLLUP_VERSION,
    type: 'education-rollup-index',
  },
  asOf: '2026-10-12',
  programYears: [
    {
      programYear: '2018-2019',
      source: 'ledger-history',
      sourceDate: null,
      path: 'derived/education-rollup/2018-2019.json',
      world: awards,
      districtsAvailable: 1,
      districtsNotAvailable: 1,
    },
  ],
  omittedProgramYears: [
    { programYear: '2016-2017', reason: 'no reports at any snapshot date' },
  ],
  trend: {
    districts: { '61': { '2018-2019': awards }, '17': { '2018-2019': null } },
    regions: { '09': { '2018-2019': awards } },
  },
}

export const GLOBAL_CLUB_RACE: GlobalClubRace = {
  _format: { version: '1.0.0', type: 'global-club-race' },
  date: '2026-09-11',
  programYear: '2026-2027',
  generatedAt: '2026-09-11T10:00:00.000Z',
  scope: {
    districts: { total: 2, numbered: 1, includesUndistricted: true },
    clubsScanned: 3,
    excludedDistricts: [],
    missingDistricts: [],
    reachedAbsentToday: 0,
    officialWithoutDerived: 1,
  },
  ruleset: {
    programYear: '2026-2027',
    cspRequired: true,
    smedleyAvailable: true,
    membershipBasis: 'confirmed-renewals',
    officialRecognitionFrom: '2027-04-01',
    tiers: [
      { level: 'Smedley', goals: 10, members: 25, netGrowthAlternative: null },
      {
        level: 'President',
        goals: 9,
        members: 20,
        netGrowthAlternative: null,
      },
      { level: 'Select', goals: 7, members: 20, netGrowthAlternative: 5 },
      {
        level: 'Distinguished',
        goals: 5,
        members: 20,
        netGrowthAlternative: 3,
      },
    ],
  },
  observation: {
    firstObservedDate: '2026-07-26',
    previousSnapshotDate: '2026-08-12',
    observedDates: 3,
    resolution: 'mixed',
  },
  timeline: [
    {
      date: '2026-07-26',
      Distinguished: 1,
      Select: 0,
      President: 0,
      Smedley: 0,
      official: 0,
    },
    {
      date: '2026-08-12',
      Distinguished: 1,
      Select: 1,
      President: 0,
      Smedley: 0,
      official: 0,
    },
    {
      date: '2026-09-11',
      Distinguished: 1,
      Select: 1,
      President: 0,
      Smedley: 0,
      official: 1,
    },
  ],
  distribution: {
    goalsMet: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    membership: { lt12: 1, from12to19: 0, from20to24: 1, ge25: 1 },
    byTierRequirementsMet: {
      none: 2,
      Distinguished: 0,
      Select: 1,
      President: 0,
      Smedley: 0,
    },
    byOfficialCode: { none: 2, D: 1, S: 0, P: 0, M: 0 },
    cohorts: {
      lt12: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      from12to19: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      from20to24: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      ge25: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    },
  },
  reached: [
    {
      clubId: '3045',
      clubName: 'Limestone City Club',
      districtId: '61',
      current: {
        level: 'Select',
        activeMembersLevel: 'Select',
        goalsMet: 7,
        members: 22,
        membershipBase: 20,
        netGrowth: 2,
        aprilRenewals: 22,
        cspSubmitted: true,
        dcpGoalsAchieved: [
          true,
          true,
          false,
          true,
          true,
          true,
          false,
          true,
          false,
          true,
        ],
        divisionId: 'A',
        areaId: '01',
        country: 'Canada',
      },
      tiers: {
        Distinguished: {
          reachedOn: '2026-07-26',
          observedAfter: null,
          rank: 1,
        },
        Select: {
          reachedOn: '2026-08-12',
          observedAfter: '2026-07-26',
          rank: 1,
        },
      },
      official: null,
    },
    {
      clubId: '9',
      clubName: 'Official Only',
      districtId: '61',
      current: null,
      tiers: {},
      official: { code: 'D', since: '2026-09-11', observedAfter: '2026-08-12' },
    },
  ],
  byDistrict: [
    {
      districtId: '61',
      region: '07',
      clubs: 2,
      paidClubBase: 158,
      reached: { Distinguished: 1, Select: 1, President: 0, Smedley: 0 },
      percentOfBase: 0.63,
      firstReachedOn: {
        Distinguished: '2026-07-26',
        Select: '2026-08-12',
        President: null,
        Smedley: null,
      },
      worldwideFirsts: 2,
    },
    {
      districtId: 'U',
      region: '',
      clubs: 1,
      paidClubBase: 0,
      reached: { Distinguished: 0, Select: 0, President: 0, Smedley: 0 },
      percentOfBase: null,
      firstReachedOn: {
        Distinguished: null,
        Select: null,
        President: null,
        Smedley: null,
      },
      worldwideFirsts: 0,
    },
  ],
}
