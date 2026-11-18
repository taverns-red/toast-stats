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
- the latest `labeled` event for that label, from `GET /repos/{owner}/{repo}/issues/{pr}/events` (every page), has `actor.login` equal to `rservant` **and** `performed_via_github_app` equal to `null` (#2520).

Label names compare case-insensitively everywhere: the current labels and both `labeled` and `unlabeled` events, with both sides lower-cased. GitHub treats label names that way, but an event keeps the spelling used when it happened. The latest `labeled` or `unlabeled` event for the label decides. If it's a removal, the override is revoked, so a removal spelled `DB-Breaking-Approved` can't be skipped in favour of an earlier approval (red-table#911).

### Why `performed_via_github_app` must be `null`

Cloud sessions act as `rservant`, so the actor alone can't tell Ron from an agent. The events API records which GitHub app, if any, performed each event ([Labeled Issue Event schema](https://docs.github.com/en/rest/issues/events?apiVersion=2022-11-28#list-issue-events): `performed_via_github_app` is required, `null` or a GitHub app object). Ron applying the label in the web UI gives `null`. A cloud session's event carries the Claude app object. So only a direct labeling counts.

The check fails closed on anything else: an app object, a missing field, or a value of any other type (a string, `false`, `{}`). The job summary names the app when the event has a `slug`.

This closes the cloud path. A local agent session using Ron's own `gh` token still records `null`; the agent GitHub App (ops#242) closes that path by giving local agents their own app identity.

### If GitHub stops sending `performed_via_github_app` (#2529)

The REST schema for issue events marks the field required and nullable, but the [issue event types page](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types?apiVersion=2022-11-28#labeled) doesn't list it for `labeled`. If GitHub drops the field, the check reads it as missing and fails closed, so every override fails, including Ron's own.

What it looks like:

- A breaking-change PR with `db-breaking-approved` applied by Ron in the web UI still fails the compat check.
- The job summary says the label "was last applied by rservant with no `performed_via_github_app` field, not by rservant directly" (`viaApp` in `scripts/lib/cdnJsonCompat.ts`). A real app refusal reads "via the <slug> GitHub app" instead.
- Other PRs with the label applied the same way fail too, so it isn't one bad event.

How to tell it from a real refusal: fetch the latest `labeled` event for the label (`gh api repos/taverns-red/toast-stats/issues/<pr>/events --paginate`) and look at that event's keys. If `actor.login` is `rservant` and the `performed_via_github_app` key is absent, GitHub changed the payload. If the key is present with an app object, the label was applied by an app, and the refusal is correct.

How Ron unblocks it:

1. Don't remove the guard or apply the label from an agent session. Neither is a fix.
2. Open an issue that names the failing PR and pastes the event JSON, so the change is on record.
3. Changing what the check accepts (`verifyOverride` in `scripts/lib/cdnJsonCompat.ts`) is a security-model change, so it goes through Ron and the COO, never an agent on its own. Until it lands, the breaking change waits.
4. A PR that can't wait can have its finding pinned in the grandfather list below. That list works by content hash and needs no label, but every entry needs Ron's review.

Nothing watches for this today. A weekly canary could read one known web-UI `labeled` event and fail when the key is gone. It is not built (proposed in the #2529 PR).

Only Ron applies it, in the GitHub web UI, after reading the summary. Applying it from a cloud session, or asking one to, doesn't count. Adding or removing the label re-runs the check. If anyone else removes the label and adds it back, the latest `labeled` event is theirs, and the check fails until Ron applies it again. Each new push re-runs the check and re-verifies the label. The label doesn't carry over to another PR.

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
