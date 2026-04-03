# Sprint 20 Plan — Deep Linking & Cleanup

**Planned start:** April 2026
**Theme:** Make every view shareable and bookmarkable; remove stale UX

---

## Context

Sprint 19 shipped bug fixes (#277, #278), removed ~85K lines of dead code, and cleaned up obsolete docs. The codebase is lean and accurate.

The main UX gap is **deep linking** (#272). The `useUrlState` hook exists and 7 params are already synced, but program year, date selection, column filters, and DCP projections filters are still lost on navigation.

---

## Sprint Goals

### 1. Close fixed issues (#277, #278)

**Priority: Housekeeping** — Both were fixed in Sprint 19 PR #279.

---

### 2. Deep link: program year and date selection (#272)

**Priority: High** — Currently stored in React context + localStorage. Lost on page refresh.

- Sync `selectedProgramYear` to URL param `py` (e.g., `?py=2025-2026`)
- Sync `selectedDate` to URL param `date` (e.g., `?date=2026-03-25`)
- Remove localStorage persistence (URL becomes source of truth)
- Preserve both on browser back/forward

**Scope:** `ProgramYearContext.tsx`, `DistrictDetailPage.tsx`
**Estimated:** 1 day

---

### 3. Deep link: ClubsTable column filters (#272)

**Priority: Medium** — Users can't share a filtered clubs view.

- Sync active column filters to URL (e.g., `?filter_health=vulnerable&filter_name=sunrise`)
- Use `useUrlState` for each filter that `useColumnFilters` manages
- Clear filters clears URL params

**Scope:** `useColumnFilters.ts`, `ClubsTable.tsx`, `ColumnHeader.tsx`
**Estimated:** 1-2 days

---

### 4. Deep link: DCP projections table filters (#272)

**Priority: Medium** — Tier/division/close-only filters are local state.

- Sync `filterTier`, `filterDivision`, `showCloseOnly` to URL params
- Sync sort state to URL params (prefixed to avoid collision)

**Scope:** `DCPProjectionsTable.tsx`
**Estimated:** < 1 day

---

## Deferred

| Item                            | Reason                                                             |
| ------------------------------- | ------------------------------------------------------------------ |
| **PWA (#259)**                  | Needs product review                                               |
| **PDF/CSV reports (#258)**      | Needs product review                                               |
| **Email digest (#257)**         | Needs product review                                               |
| **Club comparison (#256)**      | Needs product review                                               |
| **CDN cache monitoring (#255)** | Observability — no user-facing impact                              |
| **DORA metrics (#253)**         | Observability — no user-facing impact                              |
| **Route-based code splitting**  | Charts chunk is 119KB gzip but Lighthouse CI monitors this already |

---

## Success Criteria

- [ ] #277 and #278 closed on GitHub
- [ ] Program year and date selection preserved in URL
- [ ] ClubsTable filters preserved in URL
- [ ] DCP projections filters preserved in URL
- [ ] Shared URLs reproduce the exact view (tab, sort, page, filters, date)
- [ ] Browser back/forward preserves all state
