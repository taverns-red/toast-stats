---
date: 2026-10-28
tier: lesson
category: lesson
summary: Chromium's print-to-PDF shrinks a page that is wider than the paper until it fits, so a PDF page-count check passes on a layout that overflows the printable width; measure the document's width at the printable box in print media as well
tags: [print, testing, playwright, pdf, layout, frontend]
---

# A PDF page count passes on a layout wider than the paper

**Date:** 2026-10-28
**Issue:** #2299 (council print packs)

## What happened

The smoke for the print packs counted pages in `page.pdf()` output at Letter
and A4: one page for an area, two for a division. It passed in Chromium on the
first try. The WebKit half, which has no `page.pdf` and instead lays the pack
out in print media at the 698px printable width, failed: the club roster was
793px wide. Chromium had shrunk the whole page by about 12% to fit the paper,
which made the text smaller and also made the page count look healthy. The
count was right only because of the shrink.

## Takeaway

A page-count assertion proves height, not width. Pair it with a width check
at the printable box (`viewport.width = printable px`, `emulateMedia({ media:
'print' })`, `scrollWidth - clientWidth <= 0`), in the same engine that makes
the PDF. Shrink-to-fit is a Chromium print default, so nothing else will
complain.
