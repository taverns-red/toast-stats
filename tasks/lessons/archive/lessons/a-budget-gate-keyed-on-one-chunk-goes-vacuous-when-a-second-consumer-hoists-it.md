---
date: 2026-10-17
tier: lesson
category: lesson
summary: A bundle-budget gate that finds its route by "the chunk that holds the lazy import" goes vacuous when a second page shares that code — the bundler hoists it into a shared chunk and the gate measures that alone; key routes on what the router lazy-imports
tags: [performance, bundle-budget, ci, vite, rolldown, code-splitting, map, frontend]
---

# A budget gate keyed on one chunk goes vacuous when a second consumer hoists it

**Date:** 2026-10-17
**Issue:** #1808 (region club explorer) · **PR:** #2137

## What happened

`scripts/lib/mapRouteBudget.ts` (#1786, ADR-016 D2) defined a map route as
"the chunk that lazy-imports `BasemapMap-*.js`". With one map page that was
the page chunk itself. Adding the region map page, which reuses the district
map stack (`LazyBasemapMap`, `useClubPins`, `pinLayer`, `pinModes`), made
Vite/rolldown hoist those modules into a shared `districtMap-*.js` chunk.
That chunk now held the lazy import, so the gate measured it alone: 288 KB,
"OK". Neither page was measured. The region page was 8 KB over budget, and
the district page had gone over by about 1 KB too, without the gate noticing.
The split itself cost the district route about 1 KB of gzip (two files lose
shared dictionary and gain import/export glue), and main had left it 90 B of
headroom.

## The transferable principle

**A size gate must find its subject from the thing users actually load (the
router's lazy-imported route chunks), not from a structural marker that the
bundler can move.** Any marker ("the chunk containing X") is stable only
until a second consumer of X appears; then chunking moves it and the gate
quietly measures the wrong thing while still passing.

## How to apply

- Route = a chunk the critical path lazy-imports, whose static closure holds
  the marker. Keep a fallback ("a marker chunk no route reaches is its own
  route") so the gate is never vacuous.
- Test the gate on the two-consumer build shape, not just the one-consumer
  shape it was written for.
- When you add a second consumer of a shared stack, expect a chunk-split
  cost of about 1 KB gzip on the first consumer. Check its real number, not
  the gate's summary line.
- Win budget back with the codebase's existing pattern: code that runs only
  after a lazy dependency is up (here the pin layer's MapLibre sync, after
  MapLibre) rides in an on-demand chunk fetched on mount (`pinRuntime`, as
  `pinImages` already did, #1787).
- Gzip sizes differ by Node/zlib version (local Node 25 read about 1.4 KB
  under CI's Node 22 on a 300 KB route). Compare deltas locally; trust CI for
  absolutes.
