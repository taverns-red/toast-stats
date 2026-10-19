/**
 * No link or email in a reports file's place text (#2097, #2069).
 *
 * The daily reports (`snapshots/{date}/district_{id}_reports.json`) carry the
 * club's `location` as TI's reports print it: free text the club typed, and
 * some typed an email, a meeting link or a passcode there. Each place-text
 * value goes through `scrubPlaceText` (#2157), the same scrubber as the
 * snapshot's place text: links, emails and meeting credentials out.
 *
 * `location` is REQUIRED by the reports contract, so a value that was only
 * a link becomes `''`: the key is never removed. `repairReportsPlaceText`
 * also restores a `location` that an earlier rewrite deleted (strip run
 * 38791756094), as `''` in the schema's key order, so the file passes the
 * contract again.
 *
 * The sections that carry a place field are read from the schema, so a new
 * section with a `location` is covered without a list to keep in sync.
 *
 * One implementation for the collector (the source) and the contact-strip
 * tool (files already published). Pure; the input is never mutated.
 */
import {
  DistrictReportsSectionsSchema,
  type DistrictReportsDataset,
} from '../schemas/district-reports.schema.js'
import { containsPlaceSecret, scrubPlaceText } from './place-text.js'

/** Place-text fields of a reports record. */
export const REPORTS_PLACE_TEXT_FIELDS = ['location'] as const

/** What a repair changed: values scrubbed of a link, keys restored. */
export interface ReportsPlaceTextRepair {
  value: unknown
  scrubbed: number
  restored: number
}

interface PlaceSection {
  /** The record schema's keys, in order. */
  keys: readonly string[]
  /** Place fields the record carries. */
  place: readonly string[]
  /** Place fields the contract requires (restored as '' when missing). */
  required: readonly string[]
}

interface ShapeLike {
  shape: Record<string, { safeParse(v: unknown): { success: boolean } }>
}

const hasShape = (v: unknown): v is ShapeLike =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { shape?: unknown }).shape === 'object'

/** Section name → its record schema's place fields, read from the contract. */
const PLACE_SECTIONS: ReadonlyMap<string, PlaceSection> = (() => {
  const out = new Map<string, PlaceSection>()
  for (const [name, optional] of Object.entries(
    DistrictReportsSectionsSchema.shape
  )) {
    const section = optional.unwrap()
    if (!hasShape(section)) continue
    const records = (section.shape as Record<string, unknown>)['records'] as
      { element?: unknown } | undefined
    const record = records?.element
    if (!hasShape(record)) continue
    const keys = Object.keys(record.shape)
    const place = REPORTS_PLACE_TEXT_FIELDS.filter(f => keys.includes(f))
    if (place.length === 0) continue
    const required = place.filter(
      f => !record.shape[f]!.safeParse(undefined).success
    )
    out.set(name, { keys, place, required })
  }
  return out
})()

/** `Object.hasOwn` (this package targets ES2020). */
const own = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k)

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * A copy of `value` with every place-text value in every section scrubbed of
 * links, and every required place key that is missing restored as `''`.
 * Anything that is not a reports-shaped object comes back as it was.
 */
export function repairReportsPlaceText(value: unknown): ReportsPlaceTextRepair {
  let scrubbed = 0
  let restored = 0
  if (!isRecord(value) || !isRecord(value['sections'])) {
    return { value, scrubbed, restored }
  }

  const repairRecord = (rec: unknown, spec: PlaceSection): unknown => {
    if (!isRecord(rec)) return rec
    let changed = false
    const fixed: Record<string, unknown> = {}
    for (const f of spec.place) {
      const v = rec[f]
      if (!own(rec, f)) {
        if (spec.required.includes(f)) {
          fixed[f] = ''
          restored++
          changed = true
        }
      } else if (typeof v === 'string' && containsPlaceSecret(v)) {
        fixed[f] = scrubPlaceText(v)
        scrubbed++
        changed = true
      }
    }
    if (!changed) return rec
    // Rebuild in the contract's key order (how the writer emits it), then
    // any key the contract does not know, in its original order.
    const entries: Array<[string, unknown]> = []
    for (const k of spec.keys) {
      if (own(fixed, k)) entries.push([k, fixed[k]])
      else if (own(rec, k)) entries.push([k, rec[k]])
    }
    for (const [k, v] of Object.entries(rec)) {
      if (!spec.keys.includes(k)) entries.push([k, v])
    }
    // fromEntries defines own properties, so a `__proto__` key stays data.
    return Object.fromEntries(entries)
  }

  const sections = value['sections']
  const nextSections: Array<[string, unknown]> = []
  let anyChange = false
  for (const [name, body] of Object.entries(sections)) {
    const spec = PLACE_SECTIONS.get(name)
    if (!spec || !isRecord(body) || !Array.isArray(body['records'])) {
      nextSections.push([name, body])
      continue
    }
    const before = scrubbed + restored
    const records = (body['records'] as unknown[]).map(r =>
      repairRecord(r, spec)
    )
    if (scrubbed + restored === before) {
      nextSections.push([name, body])
      continue
    }
    anyChange = true
    nextSections.push([
      name,
      Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, k === 'records' ? records : v])
      ),
    ])
  }
  if (!anyChange) return { value, scrubbed, restored }
  return {
    value: Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === 'sections' ? Object.fromEntries(nextSections) : v,
      ])
    ),
    scrubbed,
    restored,
  }
}

/** The dataset with no link, email or credential in any place text. */
export function scrubReportsPlaceText(
  dataset: DistrictReportsDataset
): DistrictReportsDataset {
  return repairReportsPlaceText(dataset).value as DistrictReportsDataset
}
