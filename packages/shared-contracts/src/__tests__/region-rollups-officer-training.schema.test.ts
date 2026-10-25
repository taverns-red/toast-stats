/**
 * `officerTraining` in `region-rollups.json` (#2296) — reader before writer.
 *
 * RegionRollupsSchema is `.strict()`: a key it does not declare fails the
 * whole file, and the frontend shows every region page as "not published".
 * So the field has to be ACCEPTED by the deployed reader before any writer
 * emits it. This schema change ships (and is released) alone, ahead of the
 * pipeline PR that writes the field:
 *   - today's prod-shaped files (no key) still parse;
 *   - the same files WITH the key parse, on every block (district, region,
 *     world) and as null ("not collected");
 *   - a malformed value still fails — accepting the key is not accepting
 *     anything under it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RegionRollupsSchema } from '../schemas/region-rollups.schema.js'

const recorded = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '__fixtures__',
        'recorded-region-rollups.json'
      ),
      'utf-8'
    )
  ) as Record<string, unknown>

type Block = Record<string, unknown>
const blocks = (file: Record<string, unknown>): Block[] => [
  file['world'] as Block,
  ...Object.values((file['regions'] as Record<string, Block> | null) ?? {}),
  ...Object.values(file['districts'] as Record<string, Block>),
]

const distribution = {
  round1: [19, 5, 3, 14, 43, 25, 27, 25],
  round2: [161, 0, 0, 0, 0, 0, 0, 0],
}

describe('RegionRollupsSchema accepts officerTraining (#2296)', () => {
  it('a recorded file without the key (every file published so far) parses', () => {
    expect(RegionRollupsSchema.safeParse(recorded()).success).toBe(true)
  })

  it('the same file with the key on every block parses, and keeps it', () => {
    const file = recorded()
    for (const block of blocks(file)) block['officerTraining'] = distribution
    const parsed = RegionRollupsSchema.safeParse(file)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.world.officerTraining).toEqual(
      distribution
    )
  })

  it('null ("not collected") parses on any block', () => {
    const file = recorded()
    for (const block of blocks(file)) block['officerTraining'] = null
    expect(RegionRollupsSchema.safeParse(file).success).toBe(true)
  })

  it('a malformed distribution still fails', () => {
    const file = recorded()
    ;(file['world'] as Block)['officerTraining'] = {
      round1: [1, 2],
      round2: distribution.round2,
    }
    expect(RegionRollupsSchema.safeParse(file).success).toBe(false)
  })

  it('still rejects an unknown key (the strictness itself is unchanged)', () => {
    const file = recorded()
    ;(file['world'] as Block)['somethingNew'] = 1
    expect(RegionRollupsSchema.safeParse(file).success).toBe(false)
  })
})
