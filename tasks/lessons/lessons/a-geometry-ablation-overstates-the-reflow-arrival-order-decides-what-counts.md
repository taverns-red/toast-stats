---
date: 2026-08-02
tier: lesson
summary: A fonts-blocked geometry ablation shows every reflow the swap could cause, not the ones it does — arrival order decides which count, so tune against the real cold load
tags: [cls, performance, fonts, debugging, measurement, frontend]
---

# A geometry ablation overstates the reflow — arrival order decides what counts

**Date:** 2026-08-02
**Issue:** #1373 · **PR:** #1381

## What happened

Fixing the `display=swap` reflow (375px CLS 0.141), I used the two-pinned-states
diff from the previous sprint's lesson: load the page twice, once with the font
hosts blocked, both fully settled, and diff every element's geometry. It named
the mechanism perfectly — Source Sans 3 is ~6% narrower than `system-ui`, so
rankings rows collapse from two lines to one, 28px each.

After shipping the metric-matched fallback, I re-ran the ablation. The header
was fixed (`dy` 0 instead of −19) but **the table still showed 28px per row,
560px total**. Obvious conclusion: the fix is half done, go tune `size-adjust`.

So I swept it against the true layout and found a clean cliff — the table only
matched at 85–87.5%, not the 93.97% I had shipped. I was one commit away from
changing it.

Then I measured the actual cold Fast-3G load instead:

```
size-adjust   375px CLS
   93.97%      0.00221      <- shipped
      88%      0.00249
      87%      0.00308
      86%      0.00329
      85%      0.00349      <- the "geometrically perfect" value
```

The value the ablation said was wrong was the best one, and the value it
pointed at was **58% worse**.

## Why the ablation lied

CLS only counts a shift that actually happens. On Fast-3G the fonts land at
~600ms and the rankings data lands seconds later, so **the table is first
painted with the web font already installed** — it never reflows, no matter how
badly the fallback would have wrapped it. The only text that pays the swap is
what is on screen before the fonts arrive: the header block.

The ablation cannot know this. It compares two *end states* and reports every
difference the swap is capable of producing. That is exactly the right tool for
finding the mechanism and exactly the wrong tool for sizing the fix.

## The lesson

- **An ablation answers "what could move", a cold load answers "what does".**
  Use the first to find the mechanism and the second to choose the parameter.
  Never tune a number against the ablation.
- **Arrival order is part of the measurement.** A shift is only a shift if the
  element was painted before the thing that moves it arrives. When two async
  inputs race (fonts vs data, data vs layout), the same build produces very
  different numbers depending on which wins — and on a throttled connection
  the winner is stable, so this is not flakiness, it is a fact about the page.
- **A parameter sweep that finds a clean cliff is seductive and often
  irrelevant.** The cliff was real, reproducible and precisely located. It was
  also measuring a reflow the user never experiences.

## How to apply

When a CLS fix has a tunable knob, close the loop on the real metric before
committing to a value. It costs one route interception: fetch the built CSS,
append an override rule with the candidate, and read the cold-load number.

```js
await page.route(/\/assets\/index-.*\.css$/, async route => {
  const res = await route.fetch()
  await route.fulfill({ response: res, body: (await res.text()) + override(cand) })
})
```

Every arm is then the same deployed build, and the comparison is same-run.

## Related

- [[a-font-swap-reflow-masquerades-as-a-reserve-error]] — the pinned-states
  ablation this builds on. Still the right first move; just not the last one.
- [[bisecting-a-gate-with-no-headroom-finds-variance-not-a-regression]] — same
  family: a signal that is not a function of the thing you are changing.
- `frontend/e2e/landing-font-swap-cls.smoke.ts` — the cold-load measurement,
  now a gate.
