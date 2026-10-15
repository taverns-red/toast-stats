---
date: 2026-10-13
tier: lesson
summary: A free-text PII scrubber fixtured on one real sample passes while other real samples leak; run it over several before trusting it
tags: [privacy, pii, find-a-club, collector-cli, fixtures, data-pipeline]
---

# Lesson — Scrub free text against several real samples, not the one you fixtured

**Date:** 2026-10-13
**Issue:** #1789 (keep FAC Location, populate meetingSchedule[])

## What happened

FAC `Location` is free text the club types. The scrubber was written and
tested against the recorded D61 vocabulary (167 clubs): it removed emails,
URLs, meeting links, passcodes and phone numbers, and every recorded row
passed a "no contact detail left" invariant.

Running the same normaliser over six more single raw-fac files (D02, D06,
D101, D85, D91, U) found what D61 never had: a person's name with a social
handle on its own line, "c/o" plus a full name, "Contact <first name> for
link", and WeChat ids. It also found street addresses ("23300 58th Ave W")
eaten as phone numbers. None of these show in D61, so the D61 fixture could
not falsify the scrubber.

## Takeaway

For a scrubber over free text, removing known value patterns (email, phone,
URL) is not enough. The person lives in the instruction around the value
("contact Alex", "c/o …"). Drop the contact-instruction line or
parenthetical as a unit.

Before trusting it, run the real entry point over several real samples from
different regions and languages. Single-object reads are enough. Print what
survives a crude residue scan and read it by eye. The fixture records the
vocabulary, but only breadth finds the leaks.
