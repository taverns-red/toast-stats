# Spike #2605: Toast Stats as an interactive Claude connector

Status: spike, 2026-11-10. Nothing deployed. Prototype is local only, in `packages/mcp-server`.

## Verdict

**Go, when the D61 launch is done.** It is feasible and cheap, and no new runtime dependency is needed. Run it as a **staging-first, anonymous, read-only** Cloud Run service, after one Opus security review. Estimated spend is under US$1/month at 100k calls, well under the COO's US$5 line.

## Findings (every claim cited)

1. **Mechanism is MCP Apps.** A tool declares `_meta.ui.resourceUri` pointing at a `ui://` resource; the host fetches the HTML and renders it in a sandboxed iframe. The UI talks to the host over postMessage JSON-RPC (`ui/initialize`, `ui/notifications/tool-result`, `tools/call`). MIME type is `text/html;profile=mcp-app`. The host pushes the tool result (`structuredContent`) into the view, and the view can call the server's tools. [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview), [build guide](https://modelcontextprotocol.io/extensions/apps/build.md), [spec 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
2. **Claude renders it.** The overview lists claude.ai and Claude Desktop as supporting MCP Apps. [overview, "Client support"](https://modelcontextprotocol.io/extensions/apps/overview).
3. **Custom connectors can use it, no partner status needed.** The official build guide tests an MCP App by adding the server as a custom connector in Claude (Settings, Connectors, Add custom connector), and says custom connectors need a paid plan (Pro, Max, Team). [build guide, "Testing with Claude"](https://modelcontextprotocol.io/extensions/apps/build.md). A custom connector is "any third-party connector ... as long as you have the URL of its remote MCP server". [Add a connector that isn't in the directory](https://claude.com/docs/connectors/custom/add-unlisted.md). Free plan allows one custom connector (same page).
4. **Third parties can publish.** The Connectors Directory accepts submissions from organizations; "Anyone on a paid Claude plan can submit" via the developer portal, subject to review and the Software Directory Policy. No domain-ownership proof is required. [Connectors directory](https://claude.com/docs/connectors/directory.md), [submission guidelines](https://claude.com/docs/connectors/building/submission.md). Not verified: whether the directory review has extra requirements for MCP Apps views (I did not read the submission guidelines page in full).
5. **Transport and auth.** The URL must be HTTPS and reachable from Anthropic's cloud (outbound range `160.79.104.0/21`); a URL ending `/sse` selects legacy SSE. **No authentication is a supported type** ("`none`: authless server ... supported by default"); OAuth 2.0 (DCR or CIMD), static headers (beta) and lazy auth are the alternatives. [Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md), [custom connector page](https://claude.com/docs/connectors/custom/add-unlisted.md).
6. **Spec wrinkle.** The MCP Apps spec text is inconsistent on the init method name (`initialize` in one example, `ui/initialize` elsewhere) and capability field (`capabilities` vs `appCapabilities`). The prototype sends `ui/initialize` with `appCapabilities`. **Not verified against a live Claude host** (needs a public URL; out of scope). This is the main technical risk.

## Existing server (ADR-008)

`packages/mcp-server` is a stateless, read-only stdio server over `https://cdn.taverns.red`: 8 tools, Zod-validated reads, "not available, never guess" results, no analytics-core. It already depends on `@modelcontextprotocol/sdk` ^1.32.2, which ships `StreamableHTTPServerTransport`. What changes for remote: a transport (`src/http.ts`), a size/rate guard, and a bin flag (`--http`, `$PORT`). Tools are untouched. Prototype adds `show-district-card` + the `ui://toast-stats/district-card.html` view.

## Prototype (local, in this PR)

- `npm run serve:http --workspace=@taverns-red/toast-stats-mcp`, then `POST http://127.0.0.1:8080/mcp` (JSON-RPC), `GET /healthz`.
- Stateless: a fresh server per request, JSON responses, no sessions, `GET /mcp` is 405. 64 KiB body cap, per-client fixed-window rate limit (default 120/min, 429 + `Retry-After`).
- The card shows membership, payments, clubs, and Distinguished **confirmed** with **provisional** shown beside it, never summed (Ron, 2026-11-08). Distinguished is `null` ("not published") when the analytics file lacks it.
- The view is one self-contained HTML file (vanilla JS, `textContent` only, no external scripts or network, so no CSP allowances), dark-mode aware, 44px button. It uses the existing app palette (loyal blue).
- Evidence: 10 new tests (HTTP via the SDK's real `StreamableHTTPClientTransport`, MIME, `_meta.ui`, structuredContent, body/rate limits); suite 92/92 plus the stdio smoke. Live check against the real CDN returned district 61 for 2026-11-09 (161 clubs, 2,364 members, 3,633 payments, Distinguished 3 confirmed / 5 provisional). A live check also caught a bug the fixtures hid (counts sit under `data.distinguishedCounts`); fixed test-first.
- **Not done:** rendering in a real MCP Apps host (needs a public URL or the ext-apps `basic-host`).

## Architecture

Claude (Anthropic cloud) -> HTTPS -> Cloud Run `toast-stats-mcp` (min 0, max-instances cap) -> `cdn.taverns.red` (public, cached). No GCS credentials, no secrets, no database. The service account needs no IAM roles at all.

## Auth model: recommend anonymous read-only

- Everything served is already public at `cdn.taverns.red` and `ts.taverns.red`. There are no user identities, no write tools, no per-user data, so OAuth buys nothing but friction (users must complete a sign-in flow, and we would have to run an authorization server).
- Claude supports authless servers by default (finding 5).
- Mitigations instead of auth: read-only tools only (`readOnlyHint`), per-IP rate limit, request cap, max-instances cap, no secrets in the image, output sizes bounded by CDN files.
- Escalate to OAuth only if a tool ever returns non-public or per-user data. Out of scope for this product today.

## Public data only (confirmation)

The service has exactly one data source: the CDN base URL (`CDN_BASE_URL`, default `https://cdn.taverns.red`). It holds no credentials and the code has no other egress target, so it cannot read anything the public site cannot. Caveat for the security review: the snapshot files carry club contact fields (email, phone, website, address) that the existing `get-district-snapshot` tool already returns; they are already public on the CDN (a phone scrub ran under #2167), but the Opus reviewer should decide whether the remote tool set should project them out. The new card tool returns only totals.

## Rate limiting

In-process fixed window per client IP (last `X-Forwarded-For` hop, which Cloud Run's frontend appends), 120/min default. Per-instance only, so with N instances the effective cap is N x limit; the max-instances cap bounds that. A stricter global guard (Cloud Armor, ~US$5+/month) is not recommended for this scale.

## Cost (Cloud Run, us-east1, request-based billing, min instances 0)

Prices from the [Cloud Run pricing page](https://cloud.google.com/run/pricing) (the page body would not load in my fetch tool; figures below were confirmed through a search summary of that page, so re-check before spend): CPU $0.000024/vCPU-s, memory $0.0000025/GiB-s, requests $0.40/million; free tier per month 180,000 vCPU-s, 360,000 GiB-s, 2M requests (aggregated per billing account, and the account is shared).

Assumptions: 1 vCPU, 512 MiB; one "call" = 4 HTTP requests (initialize, tools/list, tools/call, resources/read), of which the tool call is ~300 ms (2-3 CDN reads) and the others ~30 ms, so ~0.39 s CPU per call. Cold starts (~1 s) are ignored; they are rare relative to the free-tier headroom.

|                             | Cost                                                                           |
| --------------------------- | ------------------------------------------------------------------------------ |
| **Idle (min instances 0)**  | **US$0** (no instance is billed with zero requests; no min-instance charge)    |
| **Per 1,000 calls (gross)** | **~US$0.012** (CPU 0.0094 + memory 0.0005 + requests 0.0016, per call x 1,000) |

| Calls / month | Gross    | After free tier                                      |
| ------------- | -------- | ---------------------------------------------------- |
| 1,000         | ~US$0.01 | US$0                                                 |
| 10,000        | ~US$0.12 | US$0                                                 |
| 100,000       | ~US$1.15 | US$0 (uses ~39k of 180k vCPU-s, 400k of 2M requests) |

- **Egress:** Cloud Run -> Claude responses are ~10 KB per call: ~1 GB at 100k calls, about US$0.1 at typical North America rates (rate not verified; page not loaded). Likely inside the small free egress allowance.
- **CDN side (the real driver):** each card reads ~130 KB (district file 52 KB + analytics 80 KB as transferred), so 100k calls is ~13 GB of Cloud CDN egress, roughly US$1 to US$1.5 at list rates (**unverified**; check the CDN SKU in the billing export). A 60 s in-process cache of the two files cuts that sharply and is a cheap follow-up.
- Net: **well under US$5/month through 100k calls** even with every figure doubled. Artifact Registry for one image is cents.

## Effort to production (~3 to 4 days)

Dockerfile + build workflow (not in `.github/**` here), Cloud Run service with max-instances cap and a dedicated no-role service account, custom domain (e.g. `mcp.taverns.red`), uptime check, in-process CDN cache, decide the contact-field projection, 2 to 3 more views if wanted (rankings, club list), verify the init handshake on a real Claude host and fix, update the existing McpPage, optional directory submission (own track, with review wait).

## Risks

1. **Host handshake mismatch** (finding 6): fixing needs a real Claude test; low cost to adjust. Mitigation: use the `@modelcontextprotocol/ext-apps` `App` class if the hand-rolled dialect proves brittle (that would be a new dependency).
2. New public surface: abuse, scraping, load. Bounded by caps; needs the Opus security review before any deploy.
3. Contact fields in `get-district-snapshot` (above).
4. MCP Apps is a young extension (spec dated 2026-01-26, marked draft in places); format may change.
5. Shared billing account: the free tier is shared across projects, so "US$0 after free tier" may not hold if other services use it.
6. Maintenance: one more deployable to keep current with schema changes (the reader schemas are already tolerant, #2493).

## Spend/deploy request checklist (from the COO comment)

Auth: anonymous read-only. Rate limit: 120/min/IP per instance plus max-instances cap. Public data only: yes, single CDN source, no credentials. Monthly estimate: under US$2 at 100k calls (Cloud Run ~US$0 after free tier; CDN egress ~US$1 to 1.5). Gates: Opus security review first.

## New runtime dependencies

**None.** `@modelcontextprotocol/sdk` and `zod` were already runtime dependencies. The view is dependency-free; `@modelcontextprotocol/ext-apps` is optional and was not added.
