---
date: 2026-10-11
tier: lesson
summary: A URL codec that serialises only the single-value case drops a multi-select on reload with no error — when a new UI makes multi-select the norm, round-trip test the multi case first
tags: [frontend, url-state, filters, testing]
---

# A URL codec that only writes the single-value case silently drops a multi-select

**Date:** 2026-10-11
**Issue:** #1836 (shared phone Filter & sort sheet)
**Tags:** frontend, url-state, filters, testing

## What happened

`clubFilterUrl` wrote `?status=` only when exactly one status was selected
(`if (values.length === 1)`). The desktop Filters panel had allowed multiple
statuses since #816, so picking "Vulnerable" and "Intervention" worked in the
session, but the second value was never written to the URL. A reload or a
shared link quietly showed a different list. No test caught it: the codec
tests round-tripped one status, and the panel tests never reloaded.

The phone sheet made multi-select chips the default interaction, so the bug
would have hit most users. It surfaced only because the sheet's red tests began
with the codec ("writes every selected status"), not the component.

## Takeaway

When a new UI changes the *typical* shape of a value (one becomes many, text
becomes a set), first round-trip test that shape through every
serialisation boundary it crosses (URL, storage, export). A codec that handles
only the old common case fails silently, not with an error.

The same review produced the companion rule. When one field gets two
filter shapes (desktop "contains" text, phone exact-match set), give the new
shape its own URL key (`?divisions=` beside `?division=`) so neither parser
has to guess.
