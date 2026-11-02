---
date: 2026-11-01
tier: lesson
summary: The District Leader Handbook's timeline names each date's owner only by a coloured dot, which text extraction drops — sample the dot's pixel colour against the page's key before citing an owner, and treat an undotted or inconsistent entry as "no owner"
tags: [ti-sources, citations, roles, deadlines, pdf]
---

# The DLH District Timeline names owners by dot colour, not text

**Date:** 2026-11-01
**Issue:** #2429 (whole-year deadline timeline with cited owners)

## What happened

#2429 needed an owner role for each program-year deadline, cited to a TI
source. `pdftotext` on the District Leader Handbook (Item 222 Rev. 03/2026)
shows the "District Timeline" (pp. 15–18) as plain dated lines: "Due: First-round
Area Director Club Visit Reports", "End: Round one club officer training…".
The owner is not in the text. Each entry has a coloured dot, and the key at
the foot of each page maps colour to role (District Director navy, Program
Quality Director red, Club Growth Director maroon, Area Director gold…).

Rendering the pages (`pdftoppm`) and sampling the dot pixels against the key
gave the owners: training dates → PQD; visit reports → Area Director. It also
showed that Oct 1 dues carry the District Director's dot and Apr 1 dues carry
none. That conflicts with the operator's ruling that payments are the Club
Growth Director's concern, so neither dues date got an owner.

## Takeaway

When a TI document encodes ownership graphically, read the graphic (render
and sample it against the key) rather than inferring from the text around it.
Where the source is silent, inconsistent between paired dates, or conflicts
with an operator ruling, show no owner and say why in the code comment.
