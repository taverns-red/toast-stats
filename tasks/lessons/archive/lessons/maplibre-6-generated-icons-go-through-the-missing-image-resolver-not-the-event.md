---
date: 2026-10-12
tier: lesson
summary: In MapLibre 6, icons generated on demand must be added from map.setMissingStyleImageResolver; adding them from the styleimagemissing event is too late and the pins never draw
tags: [maplibre, map, frontend, sdk-shape, verification]
---

# MapLibre 6: generated icons go through the missing-image resolver, not the event

**Date:** 2026-10-12
**Issue:** #1784 (district club map)

## What happened

The pins' icons are drawn on demand from their id. The basemap has no
sprite or glyphs, so this includes the cluster counts. The first build
listened for `styleimagemissing` and called `map.addImage`, which is the
pattern in most MapLibre and Mapbox examples. Unit tests passed: the layer
expressions were validated and evaluated with MapLibre's own style-spec.
On the PR preview, though, the basemap fitted D61 with **no pins**. The
console said `Image "p|light|square|#C93D3D||0|0" could not be loaded`.

## Why

MapLibre 6 resolves missing images through `map.setMissingStyleImageResolver(fn)`.
It awaits the resolver, and only fires `styleimagemissing` afterwards, once
the image is already treated as missing. An image added from the event
arrives too late for that placement.

## Takeaway

On MapLibre 6, register on-demand icons with
`setMissingStyleImageResolver`, and clear it with `null` on cleanup. More
generally, read the installed SDK's `.d.ts` for the hook you depend on.
The examples you remember may describe an older major version. Only the
deployed smoke caught this: it now finds pins in a screenshot of the map
and taps one.
