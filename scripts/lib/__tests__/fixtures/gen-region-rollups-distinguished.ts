/**
 * Generates the synthetic RegionRollups compat fixture (#2562), built by
 * buildRegionRollups from clubs carrying TI's status column and April
 * renewals, so distinguishedCounts is non-zero on every level.
 * regionRollupsDistinguishedFixture.test.ts fails if the committed JSON
 * drifts from this output.
 *
 * Regenerate from the repo root (analytics-core and shared-contracts built):
 *   npx tsx scripts/lib/__tests__/fixtures/gen-region-rollups-distinguished.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DistrictRegionHistorySchema,
  RegionRollupsSchema,
} from '@taverns-red/shared-contracts'
import {
  buildRegionRollups,
  type RegionRollupClub,
} from '../../../../packages/analytics-core/src/rollup/regionRollups.js'

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..'
)

/** Repo-relative path of the generated fixture. */
export const FIXTURE_PATH =
  'packages/shared-contracts/src/__tests__/__fixtures__/recorded-region-rollups-distinguished.json'

const HISTORY_PATH =
  'packages/analytics-core/src/rollup/__tests__/fixtures/region-rollups/config/district-region-history.json'

const club = (
  id: string,
  over: Partial<RegionRollupClub>
): RegionRollupClub => ({
  clubId: id,
  membershipCount: 20,
  membershipBase: 18,
  paymentsCount: 20,
  dcpGoals: 3,
  clubStatus: 'Active',
  cspSubmitted: true,
  octoberDuesOnTime: true,
  aprilDuesOnTime: true,
  officerListOnTime: true,
  aprilRenewals: 8,
  distinguishedStatus: '',
  ...over,
})

const districts = [
  {
    districtId: '01',
    prospectiveClubs: null,
    clubs: [
      club('1001', {
        dcpGoals: 9,
        membershipCount: 26,
        membershipBase: 20,
        aprilRenewals: 25,
      }),
      club('1002', {
        dcpGoals: 7,
        membershipCount: 22,
        membershipBase: 20,
        aprilRenewals: 10,
      }),
      club('1003', { dcpGoals: 5 }),
      club('1004', {}),
    ],
  },
  {
    districtId: '68',
    prospectiveClubs: null,
    clubs: [
      club('6801', {
        dcpGoals: 10,
        membershipCount: 30,
        membershipBase: 20,
        aprilRenewals: 28,
      }),
      club('6802', { dcpGoals: 6, aprilRenewals: 12 }),
      club('6803', {
        clubStatus: 'Suspended',
        membershipCount: 0,
        aprilRenewals: 0,
      }),
    ],
  },
  {
    districtId: '111',
    prospectiveClubs: null,
    clubs: [
      club('11101', {
        dcpGoals: 8,
        membershipCount: 25,
        membershipBase: 18,
        aprilRenewals: 20,
      }),
      club('11102', { dcpGoals: 4 }),
    ],
  },
  {
    districtId: '47',
    prospectiveClubs: null,
    clubs: [
      club('4701', {
        dcpGoals: 10,
        membershipCount: 28,
        membershipBase: 20,
        aprilRenewals: 24,
      }),
      club('4702', {
        dcpGoals: 7,
        membershipCount: 22,
        membershipBase: 20,
        aprilRenewals: 10,
      }),
    ],
  },
  {
    districtId: 'U',
    prospectiveClubs: null,
    clubs: [
      club('9001', { dcpGoals: 6 }),
      club('9002', { dcpGoals: 8, membershipCount: 24, aprilRenewals: 22 }),
    ],
  },
]

export function buildDistinguishedFixture(): unknown {
  const history = DistrictRegionHistorySchema.parse(
    JSON.parse(readFileSync(join(repoRoot, HISTORY_PATH), 'utf-8'))
  )
  const { rollups } = buildRegionRollups({
    snapshotDate: '2026-02-28',
    rankings: districts.map(d => ({ districtId: d.districtId })),
    districts,
    regionHistory: history,
    generatedAt: '2026-10-13T00:00:00.000Z',
  })
  return RegionRollupsSchema.parse(rollups)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(
    join(repoRoot, FIXTURE_PATH),
    JSON.stringify(buildDistinguishedFixture(), null, 2) + '\n'
  )
}
