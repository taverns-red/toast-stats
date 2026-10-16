/**
 * No link or email in a reports file's place text, and no required place key
 * lost (#2097, #2069).
 *
 * Fixtures are recorded D47 reports files with every club id, club name and
 * location replaced by placeholders (the email by `redacted@example.invalid`):
 * - 2026-10-15 (prod): one club's `location` is only an email, in the April
 *   and October dues sections and two educationAchievements records.
 * - 2026-06-30 (staging, after strip run 38791756094): four
 *   educationAchievements records with the `location` key deleted, which
 *   fails the contract the education rollup checks.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  containsLink,
  DistrictReportsDatasetSchema,
  REPORTS_PLACE_TEXT_FIELDS,
  repairReportsPlaceText,
  scrubReportsPlaceText,
  type DistrictReportsDataset,
} from '../index.js'

const fixture = (name: string): DistrictReportsDataset =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`./fixtures/district-reports/${name}`, import.meta.url)
      ),
      'utf8'
    )
  ) as DistrictReportsDataset

const LINKED = () => fixture('d47-2026-10-15-linked-location.json')
const DELETED = () => fixture('d47-2026-06-30-deleted-location.json')

/** Every place-text value in the dataset, by section. */
function placeValues(ds: DistrictReportsDataset): unknown[] {
  const out: unknown[] = []
  for (const body of Object.values(ds.sections)) {
    const records = (body as { records?: unknown[] }).records ?? []
    for (const r of records) {
      for (const f of REPORTS_PLACE_TEXT_FIELDS) {
        if (f in (r as object)) out.push((r as Record<string, unknown>)[f])
      }
    }
  }
  return out
}

describe('scrubReportsPlaceText (#2097)', () => {
  it('the recorded D47 file carries an email in place text (precondition)', () => {
    expect(
      placeValues(LINKED()).filter(v => containsLink(String(v)))
    ).toHaveLength(4)
  })

  it('leaves no link or email in any place-text field of any section', () => {
    const out = scrubReportsPlaceText(LINKED())
    expect(placeValues(out).some(v => containsLink(String(v)))).toBe(false)
  })

  it('keeps the location key: a place that was only an email becomes ""', () => {
    const out = scrubReportsPlaceText(LINKED())
    for (const key of [
      'aprilDuesRenewal',
      'octoberDuesRenewal',
      'educationAchievements',
    ] as const) {
      const hit = out.sections[key]!.records.filter(r => r.club === '9000003')
      expect(hit.length).toBeGreaterThan(0)
      for (const r of hit) expect(r.location).toBe('')
    }
    expect(DistrictReportsDatasetSchema.safeParse(out).success).toBe(true)
  })

  it('keeps the words of a place and drops only the link', () => {
    const ds = LINKED()
    ds.sections.newClubs!.records[0]!.location =
      'Redacted Place 7, https://example.invalid/redacted'
    expect(
      scrubReportsPlaceText(ds).sections.newClubs!.records[0]!.location
    ).toBe('Redacted Place 7')
  })

  it('changes nothing but linked place text', () => {
    const before = LINKED()
    const out = scrubReportsPlaceText(before)
    for (const [key, body] of Object.entries(out.sections)) {
      const orig = (before.sections as Record<string, { records?: object[] }>)[
        key
      ]!
      const records = (body as { records?: object[] }).records
      if (!records) {
        expect(body).toEqual(orig)
        continue
      }
      records.forEach((r, i) => {
        const o = orig.records![i] as Record<string, unknown>
        for (const [k, v] of Object.entries(r)) {
          if (k === 'location' && containsLink(String(o[k]))) continue
          expect(v).toEqual(o[k])
        }
      })
    }
  })

  it('does not mutate its input', () => {
    const before = LINKED()
    const copy = structuredClone(before)
    scrubReportsPlaceText(before)
    expect(before).toEqual(copy)
  })
})

describe('repairReportsPlaceText (#2097)', () => {
  it('the recorded 2026-06-30 file fails the contract (precondition)', () => {
    expect(DistrictReportsDatasetSchema.safeParse(DELETED()).success).toBe(
      false
    )
  })

  it('restores a deleted location as "", in schema key order, and passes the contract', () => {
    const { value, scrubbed, restored } = repairReportsPlaceText(DELETED())
    expect(restored).toBe(4)
    expect(scrubbed).toBe(0)
    const records = (value as DistrictReportsDataset).sections
      .educationAchievements!.records
    for (const r of records) {
      expect(Object.keys(r)).toEqual([
        'club',
        'division',
        'area',
        'name',
        'location',
        'award',
        'achievementCount',
      ])
    }
    expect(records.filter(r => r.location === '')).toHaveLength(4)
    expect(DistrictReportsDatasetSchema.safeParse(value).success).toBe(true)
  })

  it('counts scrubbed values and is idempotent', () => {
    const first = repairReportsPlaceText(LINKED())
    expect(first).toMatchObject({ scrubbed: 4, restored: 0 })
    expect(repairReportsPlaceText(first.value)).toMatchObject({
      scrubbed: 0,
      restored: 0,
      value: first.value,
    })
  })

  it('leaves a section with no place field, and a non-reports value, alone', () => {
    const ds = DELETED()
    const odd = { sections: { officerList: { records: [{ club: '1' }] } } }
    expect(repairReportsPlaceText(odd)).toEqual({
      value: odd,
      scrubbed: 0,
      restored: 0,
    })
    expect(repairReportsPlaceText([1, 2])).toMatchObject({ restored: 0 })
    expect(repairReportsPlaceText(null)).toMatchObject({ restored: 0 })
    expect(ds).toEqual(DELETED())
  })
})
