---
date: 2026-10-12
tier: lesson
summary: Moving code into a lazy chunk can grow the first load — a lazy chunk that statically imports a module the page imports lazily makes the bundler split shared modules into new counted chunks; measure every split
tags: [performance, bundle-budget, code-splitting, vite, rolldown, map]
---

# Moving code into a lazy chunk can grow the first load

**Date:** 2026-10-12
**Issue:** #1788 (map filters, map route at its 300 KB budget)

## What happened

To keep the map route's first load flat, the phone-only sheets moved into
an on-demand chunk (`MapPhoneSheets`). The measured first load went **up**
by about 330 B, not down. The new chunk statically imported
`MapClubSummary`, which the page also imports lazily. Rolldown then pulled
`pinModes` out of the page chunk into its own shared chunk. That chunk is
still statically imported by the page, so it is still counted. It also
added chunk overhead and lost the cross-module gzip context.

Passing the summary in as a React node from the page (the page's own lazy
`MapClubSummary`), and handing the mode buttons in as a render prop,
removed the split. The first load then dropped below the baseline.

## Takeaway

- A "move it to a lazy chunk" saving is a hypothesis, not a fact. Rebuild
  and re-measure after each split, using CI's Node (`npx -p node@$(cat .nvmrc)`).
- Check the route's chunk list for a new shared chunk (here
  `pinModes-*.js`). When a new name appears in the counted set, the split
  backfired.
- A lazy chunk should take what the page already owns as props: nodes,
  render props, callbacks. It should not statically import a module that
  the page loads lazily.
- What moved out cleanly here: interaction-only UI (the filter UI and its
  runtime, loaded on first open or when the URL needs it) and
  data-dependent UI that renders after the data anyway (legend chips).
