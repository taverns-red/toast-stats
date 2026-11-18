---
date: 2026-10-15
tier: lesson
summary: A "neutral" background can be doing palette-separation work; when you re-tune it, re-run every validator that imports it, not only the one named in the spec
tags: [colour, accessibility, dataviz, map, validation, css]
---

# A neutral background can be doing palette-separation work

**Date:** 2026-10-15
**Issue:** #2080 (new pages match the app palette; basemap re-tune)

The basemap land was the warm `--rt-paper` beige (`#F4F1EB`). The map-pin spec (§6.3) named only the pin validator as the thing to re-run when land changes, and the pins passed with cool app neutrals. But the world choropleth ties its "no clubs" fill to the basemap land, and its lowest bin is a pale blue. The warm tint was what kept that bin ≥ ΔE 8 from the land under every colour-vision simulation. With a cool grey land (`#F1F3F5`), the gap fell to 5.4, and no cool grey closer than white cleared 8.

**Takeaway:** before re-tuning a shared background colour, grep for every import of the constant (here `BASEMAP_COLOURS`) and run each validator that uses it. A low-chroma hue can still be what separates a palette from its ground. Search candidates in a canary test against the real validator helpers (`test-utils/colourScience`), not by eye.
