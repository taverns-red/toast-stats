# Runbook: CDN JSON compat check and the `db-breaking-approved` override

- **Issue:** #2494. **Decision:** ADR 0019 in `taverns-red/ops` (steps 1 and 3; step 2, the publish-time check, is separate).
- **Check:** `CDN JSON Compat` (`.github/workflows/cdn-json-compat.yml`), on every PR to `main`.
- **Logic:** `scripts/lib/cdnJsonCompat.ts`, unit-tested in `scripts/lib/__tests__/cdnJsonCompat.test.ts`. Runner: `scripts/check-cdn-json-compat.ts`.

## What it checks

The frontend and the mcp-server read CDN JSON with the shared-contracts `*ReaderSchema` exports. The check builds those schemas from the latest app release tag (`git describe --tags --abbrev=0 --match 'toast-stats-v*'`) and compares both ways:

- **Backward:** the release's readers parse the PR's fixtures, so the live app (or a rollback) reads what this PR's pipeline will publish.
- **Forward:** the PR's readers parse the release's fixtures, so this PR's app reads what is on the CDN today.

The fixtures are the ones `COMPAT_FIXTURES` lists: one per reader schema, under `packages/shared-contracts/src/__tests__/`. The guard's tests fail if a reader has no fixture, or if a fixture no longer matches the PR's strict writer schema. So a PR that changes what the pipeline writes has to update the fixture, and the check then sees the change.

An added field passes: readers strip unknown keys (#2493). A field the PR **removes or retypes**, or one the PR's reader newly **requires**, fails.

It fails closed. A tag it can't extract or build, a missing fixture, no reader schemas, or a GitHub API error is a failure, never a skip.

## Run it locally

```bash
npm run build:shared-contracts
npx tsx scripts/check-cdn-json-compat.ts                     # against the latest release
COMPAT_BASE_TAG=toast-stats-v2.80.1 npx tsx scripts/check-cdn-json-compat.ts
```

Without `GITHUB_TOKEN`, `GITHUB_REPOSITORY` and `PR_NUMBER` the override can't be verified, so a breaking change fails locally.

## When it fails

1. Read the job summary. It lists each finding with its direction, reader, the first parse issues and, for a rejection, the fixture's content hash.
2. If the break isn't intended, make the change additive: keep the old field (or make the new one optional on the reader) for one release, then remove it once that release is live.
3. If the break is intended (the old release really can't read the new data, and you accept that the live app or a rollback breaks until deploy), ask Ron for the override.

## The override: `db-breaking-approved`

A breaking finding passes only when both hold at check time:

- the PR has the `db-breaking-approved` label, read live from the REST API (not the event payload);
- the latest `labeled` event for that label, from `GET /repos/{owner}/{repo}/issues/{pr}/events` (every page), was by `rservant`.

Only Ron applies it, after reading the summary. Adding or removing the label re-runs the check. If anyone else removes the label and adds it back, the latest `labeled` event is theirs, and the check fails until Ron applies it again. Each new push re-runs the check and re-verifies the label. The label doesn't carry over to another PR.

The label must exist in the repo before Ron can apply it (Settings → Labels, or `gh api repos/taverns-red/toast-stats/labels -f name=db-breaking-approved -f color=B60205 -f description='ADR 0019: rservant-approved breaking CDN JSON change'`).

## Grandfathering a known shape

`scripts/lib/cdnJsonCompatGrandfathered.json` pins findings that are allowed to keep failing, by content hash:

```json
{
  "entries": [
    {
      "hash": "sha256:…",
      "reader": "RegionRollups",
      "direction": "backward",
      "reason": "#NNNN: why this is acceptable"
    }
  ]
}
```

An entry matches only that hash, reader and direction together. The hash covers the fixture's content with keys in sorted order, so an edit to the fixture under the same name is checked again. Missing fixtures and missing schemas can't be grandfathered. The list starts empty, and every entry needs a reason and Ron's review.
