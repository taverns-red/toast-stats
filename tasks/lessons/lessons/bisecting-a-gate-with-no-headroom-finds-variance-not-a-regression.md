---
date: 2026-08-01
tier: lesson
summary: Bisecting a threshold gate that has no headroom identifies variance, not a culprit — measure the baseline before believing the bisect
tags: [ci, lighthouse, debugging, flakiness, performance]
---

# Bisecting a gate with no headroom finds variance, not a regression

**Date:** 2026-08-01
**PR:** #1357 (issue #1359)

## What happened

The Lighthouse CLS gate (`<= 0.1`) went red on a PR. A bisect across the
branch looked textbook:

```
dbbed9da  ->  pass
a964d30d  ->  pass
1c25f1cc  ->  FAIL (0.271)
```

Three commits, one clean transition. I concluded — and said out loud — that
the density commit caused it, and started reverting its four changes to find
which one.

Then I measured the **parent** commit locally against the same fixtures:
`0.265`. Identical. The commit the bisect blamed had changed nothing about
CLS at all.

## Why the bisect lied

The page had two independent layout shifts:

- **0.083** — deterministic, on every single run.
- **0.179** — only counted when the loading skeleton painted before the data
  arrived, which depends on runner timing.

So the gate's real state was "0.083 of a 0.1 budget spent unconditionally,
with a coin flip that adds 0.179." Every green run was green by luck. A
bisect over that samples a Bernoulli trial and hands back a boundary, and the
boundary looks exactly like a regression because that is the shape bisect
always produces.

## The lesson

**A bisect assumes the signal is a function of the commit. On a threshold
gate with no headroom, it is a function of the commit *and* the roll.**
Before believing a bisect result on a numeric gate:

1. Measure the "good" side and confirm it is actually good — not merely
   under the line by less than the run-to-run spread.
2. Look at the spread. Three local runs of the current tree gave
   `0.265, 0.265, 0.000` — a bimodal distribution, which is the tell. A
   metric that flips between two values is not measuring your diff.
3. Only then attribute it.

The corollary is the more useful half: **a gate passing at 83% of budget is
already broken**, it just hasn't reported yet. The 0.083 shift had been
there since the fixtures were committed, and the first change to nudge the
timing would take the blame for it.

## What actually found it

Not the aggregate score. A `PerformanceObserver('layout-shift')` probe
printing each entry's `value`, `startTime` and `sources` named both shifting
elements and the exact millisecond, in one run:

```
t=331ms value=0.1789  <DIV.districts-rankings-table-wrap> y 386 -> 791
t=371ms value=0.0832  <DIV.districts-rankings-table-wrap> y 791 -> 575
```

Two causes, immediately separable. Reach for the per-entry data before the
scalar; a single number cannot tell you it is the sum of two unrelated bugs.
