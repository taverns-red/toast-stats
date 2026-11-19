# Toast Stats backlog plan

Updated 2026-11-19. The owner is the Toast Stats repo session (VP, ADR 0020 in `taverns-red/ops`).

The goal is zero open issues that aren't parked. Every open issue is in one of three states:

- **next:** ranked below.
- **parked:** labelled `parked`, with a comment giving the reason and a revisit date or trigger.
- **closed:** with a reason.

## Counts

|                                          | Open | Next | Parked |
| ---------------------------------------- | ---- | ---- | ------ |
| 2026-11-18, before grooming              | 137  | 137  | 0      |
| 2026-11-19, after Sprint 1 and this pass | 94   | 90   | 4      |

## Parked

| Issue | Reason                                                            | Revisit              |
| ----- | ----------------------------------------------------------------- | -------------------- |
| #2398 | Decommission savings can only be confirmed from the November bill | 2026-12-05           |
| #3046 | Delete the disabled legacy service accounts after a month's wait  | 2026-12-18           |
| #2523 | Narrowing the cloud label guard needs the agent GitHub identity   | when ops#242 closes  |
| #2567 | Measure backfill cost against October                             | at the next backfill |

## Next, in order

Builders run on Sonnet, 3 or 4 at a time. Each PR has a red test first and one independent review, and merges on a green exact head. Each sprint ends with a release, which needs an OK each time.

### Batch 1: Sprint 1 leftovers and review follow-ups (2026-11-19 to 11-20)

- #1614: President's Membership Retention Award, as a labelled estimate. 6 PRs; the 2025–26 rebuild needs Ron's OK.
- #3019: a staging drill path for the auto-restore decide job. Then the COO's one approved drill, which closes #2856, #2858 and #2977.
- #2418: re-measure the agent CLI.
- #2810: take the scripts-suite timings in CI.
- #3034, #3038 (items 2–4), #3045, #3049: review follow-ups.
- #3052: this plan.
- #2939 closes at the next release deploy.

### Batch 2: pipeline and data (2026-11-19 to 11-25; each needs a daily run as proof)

- #3011, then #3007 phases 2 and 3 (reinstatable clubs).
- #2580, then epic #2555.
- #2475, #2486, #2494 (pipeline gate; tell the COO), #2503, #2572, #2594, #2627, #2697, #2782, #2797, #2811, #2815, #2839, #2845.
- #2439: the orphan delete, under Ron's unspent one-use approval from 11-13.

### Batch 3: CI, performance and security (2026-11-24 to 11-26)

- #2517, #2550, #2568, #2574, #2673, #2692, #2750, #2752, #2790, #2791 with #2852, #2793, #2795, #2844, #2922, #2513.
- #2860: try the firebase-tools bump first. It must be done by 2026-12-14.
- #2877 and #2970: SHA-pin actions (COO-approved; the COO's Opus guard review comes before merge).
- #2953 (whether the bucket allows public listing, after the freshness check reads through the CDN) and #2954 (runbook plus one rules line).

### Batch 4: accessibility (2026-11-27 to 11-30)

#2647, #2657, #2658, #2667, #2682, #2754, #2756, #2762, #2779, #2784, #2829.

### Batch 5: UI polish and wording (2026-12-01 to 12-03, legacy palette only)

#2651 (one PR per primitive), #2653, #2654, #2671, #2678, #2694, #2707, #2714, #2716, #2717, #2720, #2723, #2728, #2730, #2744, #2745, #2746, #2747, #2760, #2770, #2780, #2822, #3020.

### Batch 6: P3 features (2026-12-04 to 12-11; Ron kept all three)

- #2764: region What Changed events. Staging proof first; the prod publish needs Ron.
- #2498: 3D spike-map social image. Each publish needs Ron.
- #2433: remote MCP endpoint. COO approval and a security review come before any build.

**Zero unparked: about 2026-12-11.** New review follow-ups land about 1 per 3 PRs. Anything S-sized gets fixed inside the PR that caused it.

## Needs Ron

- The #1614 rebuild of the 2026-04-30, 05-31 and 06-30 dates, so the 2025–26 standings show.
- A release at the end of each batch.
- The prod publishes for #2764 and #2498.
