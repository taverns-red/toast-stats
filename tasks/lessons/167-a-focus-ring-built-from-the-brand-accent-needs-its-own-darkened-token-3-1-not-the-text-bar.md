---
id: '167'
category: lesson
tags: [accessibility, css, frontend, dark-mode, tests]
auto_load: true
date: 2026-06-13
issues: [1106]
---

# Lesson 167 — A focus ring built from the brand accent needs its own darkened token; the 3:1 non-text floor is a different bar than where the accent is safe as fill

**Date:** 2026-06-13
**Issue:** #1106 (epic #1191 Sprint 7 — amber `--rt-stats` focus rings fail 3:1 on light surfaces)
**PR:** _(record on merge)_

## What happened

The product accent `--rt-stats` (#d4873f, amber) was the sole focus affordance
at ~10 sites via `outline: none; box-shadow: 0 0 0 2px var(--rt-stats)`. The
accent is fine as a _fill_ (white text on the amber pill clears AA) and fine as
the _404 numerals_, so it had been reached for as the focus ring too. But a
focus indicator is **non-text graphic** — WCAG 1.4.11 holds it to **3:1 against
the adjacent surface**, and amber-on-white is only **2.86:1**. The accent passed
every bar it was originally chosen for and still failed the one the focus ring
lives under.

The fix is a focus-specific token, not a brand edit: `--rt-stats-focus`
(`redesign.css`, the local token file — `rt-brand-v1.css` is copy-on-release and
must stay untouched). Light mode = a darkened amber `#b5651d` (4.34 / 4.15 /
3.90:1 on `--surface` / `--surface-2` / `--surface-3`); dark mode **remaps back
to the bright accent** `var(--rt-stats)` (5.5–6.2:1 on the dark surfaces, where
it already passed). A darker ring on a dark surface would _lose_ contrast — the
token must move with the surface (lesson 093/094), so the remap is load-bearing,
not cosmetic.

## The transferable principle

**A brand accent that clears its text/fill contrast can still fail the 3:1
non-text floor when reused as a focus indicator — they are different WCAG bars
on different surfaces. Don't darken the accent globally (it would dim every
fill/numeral consumer); mint a sibling `--accent-focus` token, darken it for the
light surfaces the ring lands on, and remap it back to the bright accent in dark
mode where dark-on-dark would otherwise regress.** The non-focus uses of the
accent stay on the original token, untouched.

## How to apply

- Auditing a focus ring? Check 3:1 against **every** surface it lands on
  (`--surface`, off-white `--surface-2`, `--surface-3`), not just white — the
  off-white surface is the tightest margin (lesson 112).
- The audit reuses the established CSS-parsing harness (resolve the token
  through the `:root` / `[data-theme='dark']` maps, assert the ratio). Resolve
  the dark remap through the **brand file**, not the inline `var(--x, #hex)`
  fallback — leaning on the fallback is undefined-token theatre (lesson 132).
  Prove it falsifiable: set the token back to the bright accent and confirm the
  light cases drop below 3:1 (lesson 107).
- Pair the contrast assertion with a **site-guard** regex: every
  `box-shadow: 0 0 0 2px var(--…)` focus ring (and any paired `:focus`
  `border-color`) must use the focus token, so a future site can't quietly
  re-introduce the bare accent.

## Related

- [[112-the-verification-sprint-contrast-guard-earns-its-keep-on-the-marginals]]
  — audit every surface; off-white is the tight one. The light-side mirror idea.
- [[058-invisible-select-overlay-needs-focus-within-ring]] — focus-ring
  _presence_ (2.4.7); this is focus-ring _contrast_ (1.4.11).
- [[093-a-token-that-doesnt-remap-in-dark-is-a-trap-for-any-non-link-consumer]],
  [[107-css-audit-matcher-must-exclude-pseudo-class-rules-or-hover-shadows-the-resting-state]],
  [[132-a-var-fallback-on-an-undefined-token-is-a-permanent-literal-not-a-theme]].
