---
date: 2026-09-28
tier: lesson
summary: A "paid/verified" signal is scoped to the period it pays for — gate it on that period covering the viewed date, and derive the period from the event date, not the report's program-year label
tags: [data-pipeline, frontend, reports, dues-renewal, overlay, program-year, verification]
---

# A payment signal is period-scoped — gate it on the period it pays for

**Date:** 2026-09-28
**Issue:** #1586 (PR #1587) · **Related:** #1069 (the overlay), Lesson 172

## What happened

The read-time Dues Renewal overlay promoted a club to **Active** on any
`Verified complete - <date>` in either the April or October section. Pembroke
& Area Club (D61 #5833) was **Low** for the April–Sept period, but it paid its
**October** dues early (verified Aug 3). From August onward it showed "Active ✓
renewal verified 2026-08-03", even though that payment only covers Oct 1 – Mar 31.
The unit tests stayed green because the original fixture only covered the
closing-period scenario the overlay was designed for: a late-May payment on a
frozen base. Nobody wrote the case where the signal is true but the period it
covers hasn't started yet.

## The transferable principle

**"Paid" answers "for which period?", not just "yes/no".** A payment,
renewal, or subscription flag is only valid evidence for the period it pays
for. Treating it as a timeless boolean works in the scenario it was designed
for and breaks for early payments (which promote a club before its period
starts) and lapsed ones (which keep promoting after the period ends).

A second trap: **the container's label doesn't tell you the cycle.** TI's
reports keyed `2026-2027` carry the April **2026** cycle next to the October
**2026** cycle, so "April section + program year → April 2027" is wrong. Derive
the period from the event itself: here, the season boundary nearest the
verified date, six months long.

## How to apply

- When a status is inferred from a payment or verification record, write the
  **early** and **lapsed** test cases, not just the late/closing one.
- Build the period from the record's own date and check it against the
  **viewed** date (the snapshot date), not "now", so historical views stay
  correct.
- Before trusting a section or program-year label to identify a cycle, tally
  the event dates actually present in each section of live data.
