---
date: 2026-11-04
tier: lesson
category: lesson
summary: A strict Zod schema shared by the writer gate and the reader makes every added field break the live release; keep strictness at the writer and parse on the read path with a deep-stripping variant
tags: [contracts, zod, schemas, frontend, mcp-server, compatibility, privacy]
---

# A writer contract is not a reader contract: strict belongs at the gate

**Date:** 2026-11-04
**Issue:** #2493 (ADR 0019 step 0 in `taverns-red/ops`)

## What happened

Nine shared-contracts schema files used `.strict()` / `z.strictObject`, mostly
as privacy guards ("an extra key, a sponsor's name or a club email, must fail
the content gate"). The frontend's `services/cdn.ts` and the mcp-server's read
client parsed the CDN files with the same schemas. So an additive publish,
which a reader should ignore, made `safeParse` fail and the page showed
"not available" on the release that was live. A rollback would too.

## The takeaway

Strictness is a property of the **gate**, not of the data shape. The same
contract needs two parse modes: strict where data is about to be published,
tolerant where it's read. `toTolerantReader(schema)` in shared-contracts
rebuilds a schema with every strict object, at any depth, turned into a
stripping one, and keeps the refinements. The `*ReaderSchema` exports use it.

- `.strict()` is per object, not deep. Count strict objects with
  `findStrictObjects(schema)`, never by grepping the top-level declaration. A
  non-strict envelope (`DistrictReportsDatasetSchema`) can still hide a strict
  row (`sponsorsMentors.records[]`).
- A strict object inside a union (`ScrapedRecordSchema`'s FAC address and
  coordinates) fails the whole record too, so the mcp-server's district
  snapshots were exposed through a schema with no `.strict()` of its own.
- The guards (`frontend/src/services/__tests__/readerSchemasTolerant.test.ts`,
  `packages/mcp-server/src/__tests__/reader-schemas-tolerant.test.ts`) scan
  the reader sources for the schemas they parse with. A new reader that uses
  a strict schema fails them.
