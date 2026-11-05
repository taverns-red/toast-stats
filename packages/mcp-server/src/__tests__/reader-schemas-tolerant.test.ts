import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ZodType } from 'zod'
import * as contracts from '@taverns-red/shared-contracts'
import * as discovery from '../schemas/cdn-discovery.schema.js'
import * as rankings from '../schemas/cdn-rankings.schema.js'
import * as common from '../schemas/common.js'

/**
 * Guard (#2493, ADR 0019 step 0 in `taverns-red/ops`): the CDN read client
 * never parses with a schema that rejects unknown keys. A newer pipeline may
 * add a field; under a strict schema every tool reading that file would
 * answer "not available — schema validation failed" until the server is
 * upgraded. Readers use the `*ReaderSchema` exports (`toTolerantReader`).
 *
 * Scope: every `<Name>Schema` the read client (src/cdn/*.ts) names. Each
 * must resolve to a known schema with no strict object at any depth.
 */
const here = dirname(fileURLToPath(import.meta.url))
const cdnDir = join(here, '..', 'cdn')

const registry = {
  ...contracts,
  ...discovery,
  ...rankings,
  ...common,
} as unknown as Record<string, ZodType | undefined>

const names = new Set<string>()
for (const file of readdirSync(cdnDir).filter(f => f.endsWith('.ts'))) {
  const text = readFileSync(join(cdnDir, file), 'utf8')
  for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9]*Schema)\b/g)) {
    names.add(m[1]!)
  }
}

describe('mcp-server read client parses with tolerant schemas (#2493)', () => {
  it('finds the schemas the client reads with (the scan is not empty)', () => {
    expect(names.size).toBeGreaterThan(0)
  })

  it.each([...names].sort())('%s rejects no unknown key', name => {
    const s = registry[name]
    expect(s, `${name} is not a known schema export`).toBeDefined()
    expect(contracts.findStrictObjects(s!)).toEqual([])
  })
})
