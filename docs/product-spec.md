# Product Spec — Toast Stats

**Live site:** [ts.taverns.red](https://ts.taverns.red)
**Last updated:** April 3, 2026

---

## What is this?

A data visualization platform for **Toastmasters district leaders** to track club performance, identify at-risk clubs, and make data-driven decisions. It scrapes public Toastmasters dashboard data, computes analytics, and presents them through a CDN-served React SPA.

### Core value proposition

> "See your district's health at a glance, catch struggling clubs early, and track progress toward Distinguished."

### Who uses this?

| Persona           | Primary need                                                |
| ----------------- | ----------------------------------------------------------- |
| District Director | District-level membership trends, Distinguished projections |
| Division Director | Division/Area performance comparison, recognition tracking  |
| Area Director     | Club health status, at-risk club identification             |
| Club President    | Per-club membership trend, DCP goal progress                |

---

## Shipped Features

### Landing Page

| Feature                     | Description                                           | Status     |
| --------------------------- | ----------------------------------------------------- | ---------- |
| Global district rankings    | Borda-count rankings across membership, payments, DCP | ✅ Shipped |
| Multi-year comparison table | YoY district metrics comparison                       | ✅ Shipped |
| Historical rank charts      | Track rank progression over program years             | ✅ Shipped |
| Program year selector       | Switch between program years (July-June)              | ✅ Shipped |
| Dark mode                   | Full theme toggle                                     | ✅ Shipped |

### District Detail Page

| Feature                    | Description                                                        | Status     |
| -------------------------- | ------------------------------------------------------------------ | ---------- |
| **Overview tab**           | Membership count, +/- badge, club counts, world/region rank        | ✅ Shipped |
| **Clubs tab**              | Sortable table of all clubs with health status, filters            | ✅ Shipped |
| **Divisions tab**          | Division/Area performance cards, recognition tracking              | ✅ Shipped |
| **Analytics tab**          | DCP projections, leadership insights, educational awards           | ✅ Shipped |
| **Trends tab**             | Membership trend chart, payments chart, YoY comparison             | ✅ Shipped |
| Club detail modal          | Per-club membership chart, DCP timeline, base/current/change stats | ✅ Shipped |
| Club health classification | Thriving / Vulnerable / Intervention Required                      | ✅ Shipped |
| Distinguished projections  | Project year-end Distinguished club count                          | ✅ Shipped |
| Division/Area recognition  | DAP/DDP status tracking per rules reference                        | ✅ Shipped |
| Performance targets        | World rank, percentile, target thresholds from CDN                 | ✅ Shipped |
| Date selector              | Browse historical snapshots within a program year                  | ✅ Shipped |
| Deep links (URL state)     | Program year, date, tab, sort, filters, pagination synced to URL   | ✅ Shipped |

### Observability

| Feature              | Description                                                      | Status     |
| -------------------- | ---------------------------------------------------------------- | ---------- |
| CDN cache monitoring | HIT/MISS ratio tracking with dev-mode warnings at >50% miss rate | ✅ Shipped |

### Data Pipeline

| Feature                 | Description                                              | Status     |
| ----------------------- | -------------------------------------------------------- | ---------- |
| Daily scraping          | Automated daily CSV scraping from Toastmasters dashboard | ✅ Shipped |
| Transform + analytics   | Raw CSV → district snapshots → computed analytics        | ✅ Shipped |
| CDN-served data         | All data served via Cloud CDN with immutable cache       | ✅ Shipped |
| Time-series generation  | Monthly membership/payment data points per district      | ✅ Shipped |
| Time-series CDN serving | Time-series files served with 1-hour cache               | ✅ Shipped |
| Club trends index       | Per-district club trend data for modal lookup            | ✅ Shipped |
| Rebuild mode            | Re-process all historical dates from raw CSV             | ✅ Shipped |
| Rescrape mode           | Re-collect CSVs from dashboard for specific dates/year   | ✅ Shipped |
| Prune mode              | Reduce to one snapshot per month per program year        | ✅ Shipped |

---

## Business Rules

All Toastmasters-specific rules are documented in [toastmasters-rules-reference.md](file:///Users/rservant/code/toast-stats/docs/toastmasters-rules-reference.md). Key rules that drive product behavior:

| Rule                                        | Where implemented                      | Notes                                                 |
| ------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| Program year = Jul 1 – Jun 30               | `programYear.ts`, pipeline             | All data scoped by program year                       |
| Club health = Thriving/Vulnerable/IR        | `ClubHealthAnalyticsModule.ts`         | Based on membership, DCP checkpoints, CSP             |
| Net growth = Active Members − Mem. Base     | `ClubEligibilityUtils.ts`              | Used for Distinguished eligibility                    |
| Payments ≠ Members                          | `toastmasters-rules-reference.md` §4.1 | Members pay twice/year; payment count ≤ 2× membership |
| Base membership = end of prior year         | `useTimeSeries.ts`                     | Fallback: first point of current year                 |
| CSP required for Distinguished (2025-2026+) | `ClubEligibilityUtils.ts`              | Historical data assumes CSP submitted                 |

---

## Decided — Not Yet Shipped

_All items shipped. Backlog is empty._

---

## Known Issues

_No known issues. All previously tracked issues have been resolved._

---

## Architecture Decisions

| Decision                            | Rationale                                                                | Date     |
| ----------------------------------- | ------------------------------------------------------------------------ | -------- |
| CDN-only frontend (no API server)   | Data is pre-computed and immutable; CDN scales infinitely                | Jan 2026 |
| One snapshot per month (pruned)     | Daily snapshots were wasteful; monthly is sufficient for trends          | Feb 2026 |
| Time-series separate from analytics | Analytics JSON has 1-2 trend points; time-series has monthly granularity | Mar 2026 |
| Borda-count for global rankings     | Fair multi-metric ranking without over-weighting any single metric       | Jan 2026 |
| Toastmasters brand colors           | Professional appearance aligned with TI brand guidelines                 | Jan 2026 |

---

## What We're NOT Building

| Item                      | Reason                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| User authentication       | All data is public; no user-specific features needed                       |
| Real-time updates         | Daily pipeline is sufficient; real-time adds complexity with no user value |
| Mobile app                | Responsive web app covers mobile use cases                                 |
| Club-level editing        | Read-only analytics; data comes from Toastmasters dashboard                |
| Multi-district comparison | Focus on single-district depth; global rankings serve comparison           |
