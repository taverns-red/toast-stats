/**
 * Guard (#2493, ADR 0019 step 0 in `taverns-red/ops`): no frontend reader
 * parses CDN data with a schema that rejects unknown keys.
 *
 * A newer pipeline may add a field. Under a strict schema, `safeParse` then
 * fails and the page shows "not available" on the release that's live, and
 * on any rolled-back one. Readers use the `*ReaderSchema` exports, which
 * strip an unknown key instead (`toTolerantReader`).
 *
 * Scope: every non-test .ts/.tsx source under frontend/src. Each
 * `<Name>Schema.safeParse(` / `.parse(` call names a schema; it must come
 * from `@taverns-red/shared-contracts` and contain no strict object at any
 * depth (`findStrictObjects`).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'
import type { ZodType } from 'zod'
import * as contracts from '@taverns-red/shared-contracts'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(full, out)
    } else if (
      /\.tsx?$/.test(name) &&
      !/\.(test|spec)\.tsx?$/.test(name) &&
      !name.endsWith('.d.ts')
    ) {
      out.push(full)
    }
  }
  return out
}

const PARSE_CALL =
  /\b([A-Z][A-Za-z0-9]*Schema)\s*\.\s*(?:safeParse|parse|safeParseAsync|parseAsync)\s*\(/g

const uses: Array<{ file: string; schema: string }> = []
for (const file of walk(srcDir)) {
  const text = readFileSync(file, 'utf-8')
  for (const m of text.matchAll(PARSE_CALL)) {
    uses.push({ file: relative(srcDir, file), schema: m[1]! })
  }
}

const registry = contracts as unknown as Record<string, ZodType | undefined>

describe('frontend readers parse with tolerant schemas (#2493)', () => {
  it('finds the CDN readers (the scan is not empty)', () => {
    expect(uses.some(u => u.file === 'services/cdn.ts')).toBe(true)
  })

  it.each(uses)('$file: $schema rejects no unknown key', ({ schema }) => {
    const s = registry[schema]
    expect(s, `${schema} is not a shared-contracts export`).toBeDefined()
    expect(contracts.findStrictObjects(s!)).toEqual([])
  })
})
