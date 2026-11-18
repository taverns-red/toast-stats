---
date: 2026-10-13
tier: lesson
category: lesson
summary: Retiring a written file breaks any gate that compares a rebuild against the old copy; exempt the exact retired names from both sides of the comparison
tags: [pipeline, gcs, promotion, gate, data-integrity, retirement]
---

# Retiring an output needs a named exemption in every gate that compares against the last copy

**Issue:** #1798

## What happened

Compute stopped writing 8 unread per-district analytics files. Promotion is
additive and the old copies stay in prod until a separately approved cleanup.
The date-completeness gate (#1761) holds a touched date whenever staging has
fewer objects than prod for it. So the first rebuild of any already-promoted
date would HOLD and list up to 752 "missing" files, even though the change
worked as intended. New daily dates have no prod baseline, so the daily run
would never have shown the problem. Only a rebuild or backfill would.

## The transferable principle

When you stop producing an artifact, list every gate that compares *now* with
*before*: count gates, completeness gates, diff gates. Each needs an explicit
exemption for the retired names. Apply the exemption to **both** sides. If
only the baseline drops the names, a candidate that still holds stale copies
gets a padded count, and that padding can hide a real missing file. Match
exact names from one shared list. A loose pattern would also excuse new
files that happen to look similar.

## How to apply

- Keep one list of retired names in the producer's package
  (`packages/collector-cli/src/utils/retiredAnalyticsFiles.ts`) and import it
  into the gate, so the writer and the gate cannot drift apart.
- Test all three cases: only retired files missing (passes); a live file
  missing (still holds, and the message does not name retired files); stale
  retired copies in the candidate (they do not hide the missing live file).
- Exercise the change against a date that prod already has. A new date
  passes trivially.
