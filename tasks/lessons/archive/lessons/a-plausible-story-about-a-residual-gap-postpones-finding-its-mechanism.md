---
date: 2026-09-09
tier: principle
summary: A plausible story about a residual gap postpones finding its mechanism — "our basis runs low" explained away a 36-row parse defect for nine days
tags: [analytics, data-pipeline, parsing, verification]
---

# A plausible story about a residual gap postpones finding its mechanism

**Date:** 2026-09-09
**Issue:** #1540 (found by the #1534 census) · **Related:** #1497, #1514, #1426

## What happened

`Charter Date/Suspend Date` is one CSV column carrying two branches. Two
sibling parsers split it, each anchored at `^`:

```ts
trimmed.match(/^Charter\s+(.+)$/i)
trimmed.match(/^Susp\s+(.+)$/i)
```

19 cells at the 2026-06-30 close carry **both** branches —
`Charter 09/30/25 Susp 03/31/26`, a club chartered and then suspended inside
one program year. The `Susp` parser never matched them. The `Charter` parser
matched and handed `parseDateFlexible` the whole tail
`"09/30/25 Susp 03/31/26"`, which does not parse. **The cell was lost by
both**, so both movement counts under-reported and neither ever errored.

## The part worth keeping

The gap was visible the whole time and had already been explained.

`docs/investigations/1426-ceo-report-data-coverage.md` recorded, in August:
our 716 suspended and 913 new-still-active "against TI's published 733 and
932 — our basis (clubs still listed at year-end) runs low, and that is the
expected shape, not a defect to tune away." Every clause of that is
reasonable. Our basis IS narrower than TI's. A narrower basis DOES run low.
And the standing ruling (#1426 ruling 2 — publish ours, never calibrate) made
"don't chase TI's number" the correct instinct.

The residual was 19 and 17. It was 19 and 17 because of a regex.

A month later #1514 hardened the same area and wrote down "every row is
exactly one of empty, `Charter …` or `Susp …`; there is no third encoding
anywhere, so the parse was never the problem" — checked against the same
capture that contains 19 counterexamples, because nobody grepped for a row
carrying both.

**"We know why our number differs" is a hypothesis, and an unfalsified one
suppresses the search for a mechanism far more effectively than "we don't
know" does.** Refusing to calibrate to an external number is right; declining
to *explain* the difference until you can show the arithmetic is the other
half of the same discipline. A difference you have a story for still needs
its rows counted.

## The rule

When a metric differs from an external oracle by a residual you have
explained rather than derived:

1. **Count the rows the story predicts.** If "our basis excludes clubs that
   dropped off" accounts for 19, name the 19. A story that cannot produce its
   own row set is a placeholder, not a finding.
2. **Grep for the shape you assumed away.** Both parsers assumed one branch
   per cell. `grep -c 'Charter.*Susp'` over the capture is one command and
   settles it.
3. **Never assume two dates in one cell share a window.** One of the 19 is
   `Charter 01/29/26 Susp 07/01/26` — chartered in PY 2025-26, suspended on
   the first day of PY 2026-27. Parsing both branches is necessary and not
   sufficient; each date is window-tested on its own. That is why the fix
   recovers 19 charters but only 17 suspensions.

## The fix, and why it is mutation-proof in both directions

```ts
const CHARTER_BRANCH = /(?:^|\s)Charter\s+(\S+)/i
const SUSPEND_BRANCH = /(?:^|\s)Susp\s+(\S+)/i
```

Two properties, each with its own falsifier:

- `(?:^|\s)` instead of `^` — reaches a second branch, while keeping the
  literal a whole word. Drop the boundary and the whole-word test goes red
  (`Recharter 05/22/26` starts parsing as a charter).
- `(\S+)` instead of `(.+)` — the captured date is one token, so a trailing
  sibling branch cannot poison the parse. Restore `(.+)` and the combined-cell
  tests go red.

Restore both and 17 tests go red. A one-directional mutation proof would have
missed that the greedy capture, not the anchor, is what cost the *charter*
dates.
