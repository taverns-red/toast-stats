/**
 * toTolerantReader / findStrictObjects (#2493): strict objects at any depth
 * become stripping ones; nothing else about the contract changes.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { findStrictObjects, toTolerantReader } from '../index.js'

const Inner = z.object({ n: z.number() }).strict()
const Strict = z
  .object({
    a: z.array(Inner),
    r: z.record(z.string(), Inner.nullable()),
    u: z.union([z.literal('x'), Inner]),
    t: z.tuple([Inner]).optional(),
    o: z.strictObject({ lo: z.number(), hi: z.number() }),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.o.lo > v.o.hi) ctx.addIssue({ code: 'custom', message: 'lo > hi' })
  })

const valid = {
  a: [{ n: 1 }],
  r: { k: { n: 2 }, z: null },
  u: { n: 3 },
  t: [{ n: 4 }] as [{ n: number }],
  o: { lo: 1, hi: 2 },
}

describe('toTolerantReader (#2493)', () => {
  const Reader = toTolerantReader(Strict)

  it('finds every strict object in the source schema', () => {
    expect(findStrictObjects(Strict)).toEqual(['<root>', '.a[]', '.o'])
    // Inner is shared, so it is reported once, at its first path.
  })

  it('leaves no strict object in the reader', () => {
    expect(findStrictObjects(Reader)).toEqual([])
  })

  it('does not change the source schema', () => {
    expect(Strict.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })

  it('parses a valid payload exactly as the source schema does', () => {
    expect(Reader.parse(valid)).toEqual(Strict.parse(valid))
  })

  it('drops unknown keys at every depth', () => {
    const extra = {
      extra: 1,
      a: [{ n: 1, extra: 1 }],
      r: { k: { n: 2, extra: 1 }, z: null },
      u: { n: 3, extra: 1 },
      t: [{ n: 4, extra: 1 }],
      o: { lo: 1, hi: 2, extra: 1 },
    }
    expect(Reader.parse(extra)).toEqual(Strict.parse(valid))
  })

  it('keeps field types and refinements', () => {
    expect(Reader.safeParse({ ...valid, a: [{ n: 'x' }] }).success).toBe(false)
    expect(Reader.safeParse({ ...valid, o: { lo: 3, hi: 2 } }).success).toBe(
      false
    )
  })

  it('refuses a lazy schema instead of leaving it unwalked', () => {
    const Lazy = z.object({ l: z.lazy(() => Inner) })
    expect(() => toTolerantReader(Lazy)).toThrow(/lazy/)
    expect(findStrictObjects(Lazy)).toEqual(['.l (lazy: not walked)'])
  })
})
