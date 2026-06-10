# ADR-010: `ScrapedRecordSchema` matches FAC-enriched reality (extend the contract, don't move the enrichment)

- **Status:** Accepted
- **Date:** 2026-06-10
- **Issue:** #1123 (epic #1096, audit `docs/audits/deep-dive-review-2026-06-09.md` §9a)

## Context

Since #429/#431 (2026-05-15 in published data), the collector's
`FindAClubMerger` writes Find-A-Club enrichment onto every matched raw
`clubPerformance` row: `coordinates` / `address` **objects** and
`allowsVirtualAttendance` / `isProspective` **booleans**, alongside string
fields (`email`, `phone`, `website`, `meetingDay`, `meetingTime`, social
links). On the 2026-06-08 D61 snapshot that is 158 of 162 rows.

`ScrapedRecordSchema` (shared-contracts) still permitted only
`string | number | null`. No write-path code validates with the shared
schemas, so the drift shipped silently; the mcp-server (ADR-008) is the
first validating consumer, and its fail-closed reads made
`get-district-snapshot` and `get-club-health` return not-available for
**every** date ≥ 2026-05-15 — 2 of 8 MCP tools down in production while
all 50 package tests passed on hand-invented fixtures whose snapshot had
`clubPerformance: []`.

Two ways to restore agreement between contract and reality:

1. **Extend the schema** to what the collector actually writes.
2. **Move the FAC enrichment out of the raw rows** (e.g. into a parallel
   `clubEnrichment[]` array), keeping raw rows pure CSV.

## Decision

**Extend the schema (option 1).**

- Published snapshots are immutable history. Every snapshot since
  2026-05-15 carries enriched raw rows; a "pure rows" schema would
  permanently invalidate three-plus weeks of correct, already-served
  data (and any reader strict about it stays broken for those dates).
  Moving the enrichment only fixes _future_ snapshots.
- Consumers already read the enrichment from where it is (frontend club
  hero via `.clubs[]`, FAC-presence diagnostics via raw rows). The
  merge-into-rows shape _is_ the product contract now.
- The schema's job (per its own doc) is to describe what collector-cli
  writes and consumers may rely on — not an aspiration.

Specifics:

- `ScrapedRecordSchema` value union gains `boolean`, `FacCoordinatesSchema`
  and `FacAddressSchema`. The two object schemas are **strict**
  (`z.strictObject`): with every address key optional, a non-strict object
  schema would accept — and silently strip to `{}` — _any_ object, making
  the contract meaningless. `coordinates` precedes `address` in the union
  so a coordinates object can never be matched (and emptied) by the
  all-optional address shape.
- `ClubStatisticsFileSchema` gains the enrichment fields the merger writes
  to `.clubs[]` that the schema previously **silently stripped** on every
  validating parse: `phone`, `website`, `twitterLink`, `meetingDay`,
  `meetingTime`, `isProspective` (audit §9a gap).
- The TS types (`ScrapedRecord`, `ClubStatisticsFile`) mirror the schemas
  exactly, as before.

## Consequences

- The contract is now anchored by a **recorded** live-CDN fixture
  (truncated/sanitized; `packages/mcp-server/scripts/record-fixtures.mjs`)
  asserted in `shared-contracts` and used by all mcp-server suites — a
  re-drift fails tests instead of production.
- Strictness trade-off: if the merger ever adds a key to `coordinates` /
  `address` (or a new enrichment value type), the schema must be updated
  **in the same PR** — that is intended; the alternative is silent drift,
  which is exactly what this ADR repairs.
- Epic #1096 Sprint 3 adds publish-time validation so the write path
  enforces this contract instead of relying on the first validating reader.
