# @taverns-red/toast-stats-mcp

A **thin, local, read-only [MCP](https://modelcontextprotocol.io) server** over the
public Toast Stats snapshot CDN ([ADR-008](../../docs/architecture-decisions/008-ai-enable-toast-stats.md)).
It lets any MCP-capable client (Claude Desktop, Claude Code, …) answer open-ended
questions about Toastmasters district performance, grounded in the **pre-computed**
pipeline output published at `https://cdn.taverns.red`.

It is deliberately **thin**:

- **Read-only, no computation.** Tools fetch CDN JSON, validate it with the
  `shared-contracts` read-schemas, and return fields. They never derive a tier,
  threshold, or recognition state, and the package imports **no `analytics-core`**.
- **Not-available, never guess.** If a question needs something a snapshot doesn't
  already contain, the tool returns a structured _not available_ — it never fabricates.
- **Local only.** stdio transport, runs on your machine. No hosting, no always-on
  service, no auth (the data is public).
- **Cite the source.** Every response carries the exact CDN URL it read and the
  snapshot `date`, so any answer is human-verifiable against the live site.

## Install

This package is **publishable but not yet published** (`@taverns-red/toast-stats-mcp`
— npm distribution ships with the `/mcp` page, epic #1162). Until then it is
distributed **locally / self-installed** from the
[Toast Stats monorepo](../../). Build it once, then point your MCP client at
the built binary.

```bash
# from the monorepo root
npm install
npm run build:shared-contracts   # mcp-server depends on the built contracts
npm run build:mcp-server         # emits packages/mcp-server/dist/bin.js
```

This produces the executable `dist/bin.js` (bin name: `toast-stats-mcp`).

## Configure your MCP client

Add a `mcpServers` entry pointing at the built bin. Use an **absolute** path.

**Claude Desktop** (`claude_desktop_config.json`) / **Claude Code** (`.mcp.json`):

```json
{
  "mcpServers": {
    "toast-stats": {
      "command": "node",
      "args": ["/absolute/path/to/toast-stats/packages/mcp-server/dist/bin.js"]
    }
  }
}
```

Restart the client; the `toast-stats` tools below become available.

### Pointing at a different CDN (optional)

The server reads `https://cdn.taverns.red` by default. Set `CDN_BASE_URL` to read a
staging origin or a local fixture server instead:

```json
{
  "mcpServers": {
    "toast-stats": {
      "command": "node",
      "args": ["/absolute/path/to/.../dist/bin.js"],
      "env": { "CDN_BASE_URL": "https://staging.example" }
    }
  }
}
```

## Tools

All eight tools are **read-only** (advertised via `readOnlyHint`). Each returns a
JSON envelope (see [Response shape](#response-shape)). `date` arguments are
`YYYY-MM-DD`; omit `date` on the dated reads to use the latest snapshot.

| Tool                    | Purpose                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-latest-date`       | Most recent published snapshot date (`v1/latest.json`).                                                                                                                                                                 |
| `list-dates`            | Every available snapshot date (`v1/dates.json`).                                                                                                                                                                        |
| `list-districts`        | District ids with snapshots + the dates each has.                                                                                                                                                                       |
| `resolve-club`          | Which district a club id belongs to. Unknown club → not available (never guessed).                                                                                                                                      |
| `get-district-snapshot` | Full per-district snapshot (roster, division/area aggregates, totals) for a date.                                                                                                                                       |
| `query-rankings`        | All-districts rankings (ranks, paid clubs, payments, distinguished tiers).                                                                                                                                              |
| `get-club-health`       | Raw per-club health-signal fields (membership, base, renewals, DCP goals, status), optionally filtered to one division. The categorical thriving/vulnerable status is **not** a snapshot field and is not derived here. |
| `get-time-series`       | Pre-computed program-year time series for a district (membership / payments / DCP / distinguished / club-health counts).                                                                                                |

## Response shape

Every tool returns a single text content block whose JSON is the standard envelope:

```jsonc
{
  "available": true,
  "sourceUrl": "https://cdn.taverns.red/v1/latest.json", // verify against the live site
  "date": "2026-05-31", // the snapshot date the data is from (or null)
  "data": {
    /* the validated CDN fields */
  },
}
```

A not-available result keeps the same shape with `available: false` and a `reason`,
and still cites the `sourceUrl` it tried — the server never guesses a value it
couldn't read.

## Verify the install (offline smoke)

`npm run smoke` builds the package and boots the **real** `dist/bin.js` over stdio
against a localhost server serving committed CDN fixtures — no network, no live
Claude client. It asserts the bin lists its tools and answers a tool call:

```bash
npm run smoke --workspace=@taverns-red/toast-stats-mcp
```

This is the same offline check CI runs (it's part of the package test suite). It
proves the install/boot path end to end; live end-to-end verification against the
real CDN from a Claude client is a separate operator-run step.

### Verify the published artifact (npm-pack smoke)

`npm run smoke:pack` packs the tarball exactly as `npm publish` would, installs
it into a clean temp dir (runtime deps resolve from the public registry only),
and runs the same offline stdio smoke against the **installed** bin:

```bash
npm run smoke:pack --workspace=@taverns-red/toast-stats-mcp
```

CI runs this on every PR. The published surface is the **bin only**: `files`
whitelists the self-contained `dist/bin.js` (esbuild-bundled — the private
workspace `shared-contracts` package is inlined at build time) plus this
README. The library barrel (`src/index.ts`) is monorepo-internal and is not
part of the published API.

## Versioning & release

The version is owned by [release-please](../../release-please-config.json)
(component `toast-stats-mcp`, manifest-tracked like every other workspace
package): conventional commits touching `packages/mcp-server` accumulate into
a release PR that bumps `package.json` and maintains the package CHANGELOG.
Merging a release PR tags `toast-stats-mcp-vX.Y.Z` — it does **not** publish
to npm. The `npm publish` wiring (provenance, 2FA/token policy) is a later
sprint of epic #1162; until it lands, publishing is a manual operator action.

## Releasing (manual, operator-attended — ruling 2026-06-12, #1164)

Releases are deliberately **not** automated: no `NPM_TOKEN` lives in CI, and
every publish requires the operator's 2FA. Flow:

1. Bump the version via PR (`npm version patch --no-git-tag-version` in
   `packages/mcp-server`, commit **both** `package.json` and the root
   `package-lock.json`), merge.
2. `git pull && cd packages/mcp-server && npm publish` — the `prepack` hook
   rebuilds from source; enter your OTP at the prompt.
3. Verify from the outside: `npm view @taverns-red/toast-stats-mcp version`
   and the clean-machine smoke
   (`cd $(mktemp -d) && npx -y @taverns-red/toast-stats-mcp` driven by any
   MCP client).

First-publish provenance: 0.1.0 was staged by npm's new-account flow and
released from the Staged Packages page (2026-06-12). A version number that
enters staging is burned — never reuse one that 403s with "previously
published".
