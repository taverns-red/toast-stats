---
date: 2026-08-03
tier: lesson
summary: A docs page that restates behaviour spread across many mechanisms cannot be generated from any one of them — couple it with a census that fails when unclaimed code appears, and prove the census fires against a synthetic case the repo can never produce
tags:
  [
    documentation,
    drift,
    guard-test,
    program-year,
    analytics,
    falsifiability,
    methodology,
  ]
---

# A docs page that restates the code needs a census, not a generator

**Date:** 2026-08-03
**Issue:** #1400 (program-year rule-change log on /methodology)
**Related:** #1399 (the sentinel that sampled one field to vouch for thirteen)

## The problem

Toastmasters moves the recognition rules between program years. The code
already knew — five DRP eras, a CSP back-compat default, an "or EOM" column
alias — but no reader did. A hand-written log fixes that for about two program
years, then quietly starts lying.

The instinct is to **generate** it: have the year-conditional helper carry the
prose the page renders, so a rule change cannot land without the log noticing.
That instinct is right about the goal and wrong about the shape, and the reason
generalises.

## Why generation was the wrong tool here

Generation needs one mechanism to hang the description on. The year-conditional
logic was four unrelated mechanisms:

| shape                          | example                                       |
| ------------------------------ | --------------------------------------------- |
| a ruleset dispatcher           | `rulesetForProgramYear`, five eras            |
| a `?? true` back-compat default | CSP, ~11 files across three packages          |
| a first-match-wins column alias | `['Level 2s or EOM', 'Level 2s']`             |
| an optional CSV column          | `'Smedley Distinguished Clubs'?: string`      |

Only the first has a callable surface. Generating from it would have covered
two of eight real changes, routed reader-facing prose through the analytics
engine (a typo fix would then touch `analytics-core`), and still missed the
2018-19 and 2022-23 eras, which exist only as data tables.

**Ask what fraction of the truth the generator's source actually holds before
choosing generation.** If it holds a minority, generation buys coupling for the
easy cases and hides the absence of coupling everywhere else — the #1399
failure shape one layer up: a check that samples one thing while vouching for
all of them.

## What worked instead: a census with two axes

The log declares which files implement each entry. A test scans the codebase
for *rule-shaped* program-year signals and fails when:

1. a file carries one and no entry claims it (nor an acknowledgement excuses
   it) — catches a rule branch landing somewhere new; and
2. a **program year** appears inside a file an entry already claims and no
   entry covers that year — catches the likely case, `if (startYear >= 2027)`
   appearing in the dispatcher the log already knows about.

Axis 2 is the one that is easy to leave out and does most of the work. File
membership barely changes; the years do.

## Making the census usable rather than noisy

A raw census over program-year literals hit 52 files, most of them
`@param … e.g. "2023-2024"`. An acknowledgement list that long is one an author
learns to append to without reading. Requiring the year mention to sit within
three lines of **rule-change vocabulary** ("new for", "retired", "prerequisite",
"onward", `rule\w*`) cut it to 25 with no real change lost — a rule branch
essentially always either compares a year or explains itself in a comment.

Two details paid for themselves:

- **Consecutive-halves normalisation** (`2026-27` and `2026-2027` are the same
  key; `2026-08` is not a program year) excludes ISO dates without a parser.
- **A stale-acknowledgement test.** An acknowledgement that no longer matches
  anything must be removed, so the list stays a decision record rather than
  residue.

## Prove the guard fires before trusting it

A census over the real tree is, by construction, always in the state where it
passes — so it cannot demonstrate its own trigger. Two moves fix that:

- Put the detection rules in a **pure function** tested against synthetic
  sources, including the case the repo can never contain: a brand-new
  `if (startYear >= 2027)` branch. That test caught a real hole — `\bruleset\b`
  does not match `CURRENT_RULESET`, so a bare dispatcher line scored zero rule
  language and the scanner stayed silent on exactly the branch it existed for.
- **Falsify the census once, by hand**, before believing it: delete an entry
  and append a fake future-year comment to a claimed file. Both must fail with
  the year named.

The census also caught two files on its first real run — including the new
util's own doc comment. A guard that finds something the day you write it is a
guard that is actually looking.
