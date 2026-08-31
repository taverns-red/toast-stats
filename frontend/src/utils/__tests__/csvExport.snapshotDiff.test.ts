import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SnapshotDiff } from '@taverns-red/shared-contracts'
import { DiffEventCategorySchema } from '@taverns-red/shared-contracts'
import { exportSnapshotDiff } from '../csvExport'

/* #795 (epic #797 Sprint 3) — diff CSV export. A sibling of exportClubPerformance
   (which exports current-snapshot fields); the diff CSV is from/to/delta data
   for two dates, plus roster changes (lesson 118). */

let captured = ''
let capturedFilename = ''

beforeEach(() => {
  captured = ''
  capturedFilename = ''
  // Capture the blob text + filename without touching the real DOM download.
  global.URL.createObjectURL = vi.fn(() => 'blob:mock')
  global.URL.revokeObjectURL = vi.fn()
  vi.spyOn(document.body, 'appendChild').mockImplementation(
    <T extends Node>(node: T) => {
      const el = node as unknown as HTMLAnchorElement
      capturedFilename = el.getAttribute?.('download') ?? ''
      return node
    }
  )
  vi.spyOn(document.body, 'removeChild').mockImplementation(
    <T extends Node>(node: T) => node
  )
  // Intercept Blob construction to read the CSV string synchronously, without
  // naming the DOM lib types (eslint no-undef doesn't know them in this env).
  const RealBlob = global.Blob
  global.Blob = class extends RealBlob {
    constructor(...args: ConstructorParameters<typeof Blob>) {
      super(...args)
      const parts = args[0] as string[]
      captured = String(parts?.[0] ?? '')
    }
  } as typeof Blob
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeDiff(
  over: Partial<SnapshotDiff['clubs']> = {},
  events: SnapshotDiff['events'] = []
): SnapshotDiff {
  return {
    districtId: '61',
    from: { date: '2026-05-25' },
    to: { date: '2026-05-26' },
    dayCount: 1,
    totals: {
      membership: { from: 100, to: 110, delta: 10 },
      payments: { from: 100, to: 110, delta: 10 },
      clubCount: { from: 2, to: 3, delta: 1 },
      distinguished: { from: 0, to: 1, delta: 1 },
    },
    clubs: {
      bothPresent: over.bothPresent ?? [
        {
          clubId: 'c1',
          clubName: 'Alpha Club',
          divisionId: 'A',
          areaId: '1',
          membership: { from: 20, to: 26, delta: 6 },
          payments: { from: 20, to: 25, delta: 5 },
          dcpGoals: { from: 4, to: 5, delta: 1 },
          distinguishedFrom: '',
          distinguishedTo: 'D',
          distinguishedChanged: true,
        },
      ],
      onlyInFrom: over.onlyInFrom ?? [],
      onlyInTo: over.onlyInTo ?? [],
    },
    events,
  }
}

describe('exportSnapshotDiff (#795)', () => {
  it('includes a header block with district and date range', () => {
    exportSnapshotDiff(makeDiff())
    expect(captured).toContain('District 61')
    expect(captured).toContain('2026-05-25')
    expect(captured).toContain('2026-05-26')
  })

  it('emits from/to/delta columns for each both-present club', () => {
    exportSnapshotDiff(makeDiff())
    const lines = captured.split('\n')
    const header = lines.find(l => l.includes('Δ Members'))
    expect(header).toBeDefined()
    expect(header).toContain('Members From')
    expect(header).toContain('Members To')
    // The Alpha row: membership 20 → 26 (+6), payments 20 → 25 (+5), dcp 4 → 5 (+1).
    const row = lines.find(l => l.startsWith('c1,'))
    expect(row).toContain('20')
    expect(row).toContain('26')
    expect(row).toContain('6')
  })

  it('records the distinguished transition', () => {
    exportSnapshotDiff(makeDiff())
    const row = captured.split('\n').find(l => l.startsWith('c1,'))
    // Became Distinguished: from '' to 'D'.
    expect(row).toContain('Yes')
  })

  it('includes roster-change rows classified by status (lesson 118)', () => {
    exportSnapshotDiff(
      makeDiff({
        bothPresent: [],
        onlyInTo: [
          {
            clubId: 'p1',
            clubName: 'Joined Co',
            divisionId: 'B',
            areaId: '2',
            clubStatus: 'Active',
          },
        ],
        onlyInFrom: [
          {
            clubId: 'p2',
            clubName: 'Left Co',
            divisionId: 'C',
            areaId: '3',
            clubStatus: 'Suspended',
          },
        ],
      })
    )
    expect(captured).toContain('Joined Co')
    expect(captured).toContain('Joined')
    expect(captured).toContain('Left Co')
    expect(captured).toContain('Left')
    expect(captured).toContain('Suspended')
  })

  it('names the file with the district and date range', () => {
    exportSnapshotDiff(makeDiff())
    expect(capturedFilename).toContain('61')
    expect(capturedFilename).toMatch(/\.csv$/)
  })
})

/* The exported CSV carries the same roster claim the view does, so it needs
   the same correction (#1443): a club the district realignment moved is not a
   club that joined or left. Genuine roster moves keep their wording. */
describe('exportSnapshotDiff — district realignment (#1443)', () => {
  it('labels transferred clubs as moved, not joined/left', () => {
    exportSnapshotDiff(
      makeDiff({
        bothPresent: [],
        onlyInTo: [
          {
            clubId: 'p1',
            clubName: 'Annexed Co',
            divisionId: 'B',
            areaId: '2',
            clubStatus: 'Active',
            transferred: true,
          },
          {
            clubId: 'p3',
            clubName: 'Brand New Co',
            divisionId: 'B',
            areaId: '2',
            clubStatus: 'Active',
          },
        ],
        onlyInFrom: [
          {
            clubId: 'p2',
            clubName: 'Departed Co',
            divisionId: 'C',
            areaId: '3',
            clubStatus: 'Active',
            transferred: true,
          },
        ],
      })
    )
    const row = (id: string) =>
      captured.split('\n').find(l => l.startsWith(`${id},`)) ?? ''
    expect(row('p1')).toContain('Moved in (district realignment)')
    expect(row('p2')).toContain('Moved out (district realignment)')
    // A genuine charter in the same export keeps the roster wording.
    expect(row('p3')).toContain('Joined')
    expect(row('p3')).not.toContain('realignment')
  })
})

/* #1461 (epic #1458 Sprint 3) — the change-event feed is the thing the What's
   Changed page actually shows, and until now the export dropped it entirely:
   the per-club delta section only covers `clubs.bothPresent`, so payments type
   attribution (#1459), club/area/division status transitions and the roster
   narrative all vanished on the way to the spreadsheet. */
describe('exportSnapshotDiff — change events (#1461)', () => {
  const event = (over: Partial<SnapshotDiff['events'][number]>) => ({
    category: 'membership' as const,
    clubId: '',
    clubName: '',
    label: '',
    magnitude: 0,
    ...over,
  })

  const eventRows = () => {
    const lines = captured.split('\n')
    const start = lines.findIndex(l => l.startsWith('Category,'))
    return start === -1 ? [] : lines.slice(start + 1)
  }

  it('emits a Change events section, one row per event in feed order', () => {
    exportSnapshotDiff(
      makeDiff(undefined, [
        event({
          category: 'membership',
          clubId: 'c1',
          clubName: 'Alpha Club',
          label: 'Alpha Club gained 6 members',
          magnitude: 6,
        }),
        event({
          category: 'dcp-goals',
          clubId: 'c1',
          clubName: 'Alpha Club',
          label: 'Alpha Club achieved 1 more DCP goal',
          magnitude: 1,
        }),
      ])
    )
    expect(captured).toContain('Change events')
    expect(captured).toContain('Category,Club ID,Club Name,Label,Magnitude')
    const rows = eventRows()
    expect(rows[0]).toBe(
      'membership,c1,Alpha Club,Alpha Club gained 6 members,6'
    )
    expect(rows[1]).toBe(
      'dcp-goals,c1,Alpha Club,Alpha Club achieved 1 more DCP goal,1'
    )
  })

  it('carries a payments event with its payment-type attribution label intact (#1459)', () => {
    exportSnapshotDiff(
      makeDiff(undefined, [
        event({
          category: 'payments',
          clubId: 'c1',
          clubName: 'Alpha Club',
          label:
            'Alpha Club recorded 7 new payments (4 October renewals, 2 new members, 1 other)',
          magnitude: 7,
        }),
      ])
    )
    // The commas inside the breakdown must survive as ONE cell (quoted), not
    // split into columns — the label IS the breakdown (#1459 kept it unstructured).
    expect(eventRows()[0]).toBe(
      'payments,c1,Alpha Club,"Alpha Club recorded 7 new payments (4 October renewals, 2 new members, 1 other)",7'
    )
  })

  it('falls back to area/division refs and entityName for entity-less events', () => {
    exportSnapshotDiff(
      makeDiff(undefined, [
        event({
          category: 'area-status',
          divisionId: 'B',
          areaId: '2',
          entityName: 'Area 2',
          label: 'Area 2 moved to Confirmed Distinguished',
          magnitude: 1,
        }),
        event({
          category: 'division-status',
          divisionId: 'G',
          entityName: 'Division G',
          label: 'Division G moved to Select Distinguished',
          magnitude: 1,
        }),
      ])
    )
    const rows = eventRows()
    expect(rows[0]).toBe(
      'area-status,B-2,Area 2,Area 2 moved to Confirmed Distinguished,1'
    )
    expect(rows[1]).toBe(
      'division-status,G,Division G,Division G moved to Select Distinguished,1'
    )
  })

  it('keeps the magnitude signed', () => {
    exportSnapshotDiff(
      makeDiff(undefined, [
        event({
          category: 'membership',
          clubId: 'c9',
          clubName: 'Shrinking Club',
          label: 'Shrinking Club lost 4 members',
          magnitude: -4,
        }),
      ])
    )
    expect(eventRows()[0]).toContain(',-4')
  })

  /* Rot guard: the section must be driven by the flat `events` list, never by a
     hardcoded category list that a new engine category silently falls out of
     (the CATEGORY_GROUPS hazard the page carries). Sourced from the schema's
     own enum so adding a category to the contract fails here until the export
     carries it. */
  it('omits no category in the DiffEvent contract', () => {
    const all = DiffEventCategorySchema.options
    exportSnapshotDiff(
      makeDiff(
        undefined,
        all.map((category, i) =>
          event({
            category,
            clubId: `id${i}`,
            clubName: `Club ${i}`,
            label: `Club ${i} ${category} happened`,
            magnitude: i,
          })
        )
      )
    )
    const rows = eventRows()
    expect(rows).toHaveLength(all.length)
    all.forEach((category, i) => {
      expect(rows[i]!.startsWith(`${category},`)).toBe(true)
    })
  })

  it('omits the section entirely when there are no events', () => {
    exportSnapshotDiff(makeDiff())
    expect(captured).not.toContain('Change events')
  })
})
