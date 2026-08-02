---
date: 2026-08-02
tier: lesson
summary: Firebase Hosting resolves each header key from the LAST matching rule (the docs say first) and matches `source` globs against the request path BEFORE rewrites — so an SPA cache rule that reads correctly is usually inverted and blind to every deep route
tags: [firebase, hosting, caching, deployment, config, spa, testing, infrastructure]
---

# Firebase Hosting header precedence is last-match-wins, and globs run before rewrites

**Date:** 2026-08-02
**Issue:** #1365 — `index.html` served `max-age=3600` with no revalidation
**PR:** #1380

## What happened

`firebase.json` set `immutable` on the hashed bundles but had no rule for
HTML, so `index.html` fell through to Firebase's default `max-age=3600` with
no validator directive. A returning visitor inside the hour got the previous
deploy's HTML, and therefore — because the bundles really are immutable —
the previous deploy's JavaScript.

The obvious fix is four lines:

```json
{ "source": "**/*.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
```

It reads correctly, it is what the issue proposed, and it is wrong twice.

## Trap 1 — header globs match the request path, before rewrites

Every route in this SPA is served by the `"source": "**" → "/index.html"`
rewrite. But Hosting matches header `source` globs against the **request**
path, not the rewrite destination. `/`, `/districts`, `/district/61/clubs`
are all extensionless, so none of them match `*.html`:

```
minimatch('/', '**/*.html')  ->  false
```

An `*.html` rule fixes only the one URL nobody navigates to directly. The
document default has to be a bare `**` rule. This generalises: for any
rewrite-driven app, a header rule keyed on the *served file's* extension
covers almost none of the traffic that file actually serves.

## Trap 2 — last match wins, and the docs say the opposite

The public docs state Hosting "applies the header defined by the **first**
rule with a URL pattern that matches the requested path." Acting on that
sentence produces a config that is exactly backwards.

The existing file could not disambiguate: the catch-all carried only security
headers and the asset rules only `Cache-Control`, so no key was ever
contested, and both precedence models predicted the observed production
behaviour. The first commit on the branch added the contested key and shipped
the inversion — a bare `**` no-cache placed *after* the asset rules, which
silently strips `immutable` from every bundle.

## How it was settled without a deploy

`firebase emulators:start --only hosting` runs **superstatic**, the same
config engine Hosting itself uses. Point it at a throwaway fixture — a few
files with realistic hashed names — and replay the real rule array:

```
** (security) | js/css | img | font | *.html no-cache | ** no-cache
GET /assets/index-B5NVCpKe.js  ->  cache-control: no-cache      # immutable LOST

** (security) | ** no-cache | js/css | img | font | *.html no-cache
GET /                          ->  no-cache
GET /districts                 ->  no-cache
GET /assets/index-B5NVCpKe.js  ->  public, max-age=31536000, immutable
```

Last match wins, per key. Rules still *merge* across matches, so the leading
security rule's CSP and `X-Frame-Options` reach every response either way —
which is why the merge behaviour looks like "first wins" until two rules
contest the same key.

Two things made the measurement trustworthy, and both are the reusable part:

- **A control run.** Replaying `origin/main`'s unmodified config through the
  same harness reproduced production exactly (no `Cache-Control` on `/`,
  `immutable` on assets). Without it, "everything is `no-cache`" is equally
  explained by the emulator overriding the header, and the whole experiment
  proves nothing.
- **Restarting the emulator between variants.** It does not hot-reload
  `firebase.json`. Two variants edited in place returned byte-identical
  results and briefly suggested the config was being ignored entirely.

## Takeaway

Config whose semantics you have only read about is unverified config. When a
platform's ordering rule is load-bearing, find the engine it actually runs
(here: superstatic, shipped inside the CLI you already have) and measure —
with a control, and with the process restarted between variants. Then encode
the *measured* model in the test, not the documented one, and prove the guard
fails against the broken ordering.

Corollary for any rewrite-driven site: a header rule matching on file
extension is a rule about URLs that end in that extension, which for an SPA
is nearly none of them.
