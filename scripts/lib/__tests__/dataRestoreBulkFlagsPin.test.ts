/**
 * BULK_ONLY_RESTORE_FLAGS was copied by hand from one gcloud SDK version
 * (#2977). A flag added in a later SDK would not be on the list, so a
 * synchronous restore would pass it and fail at run time. This test ties the
 * list to the SDK pinned in data-pipeline.yml: moving the pin fails here until
 * someone re-reads `_BULK_RESTORE_FLAGS` in surface/storage/restore.py and
 * updates BULK_FLAGS_CHECKED_SDK.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { BULK_FLAGS_CHECKED_SDK } from '../dataRestorePlan.js'

const workflow = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows/data-pipeline.yml'),
  'utf-8'
)

describe('BULK_ONLY_RESTORE_FLAGS follows the pinned gcloud SDK (#2977)', () => {
  it('was checked against the SDK every setup-gcloud step pins', () => {
    const pins = [...workflow.matchAll(/^\s*version: '(\d+\.\d+\.\d+)'\s*$/gm)]
    expect(pins.length).toBeGreaterThan(0)
    for (const pin of pins) {
      expect(pin[1]).toBe(BULK_FLAGS_CHECKED_SDK)
    }
  })
})
