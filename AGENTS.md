# Project: Toast Stats

This file contains **project-specific** context for AI coding agents.

---

## Available Tools

| Tool                   | Use Case                                      | Notes     |
| ---------------------- | --------------------------------------------- | --------- |
| `git`                  | Version control                               |           |
| `node` / `npm` / `npx` | Runtime, package management, script execution | v26.x LTS |
| `curl`                 | CDN health checks, endpoint testing           |           |
| `jq`                   | JSON processing, CDN response parsing         |           |

---

## Monorepo Structure

| Workspace        | Path                         | Purpose                               |
| ---------------- | ---------------------------- | ------------------------------------- |
| Frontend         | `frontend/`                  | React SPA (Vite, CDN-only)            |
| Collector CLI    | `packages/collector-cli/`    | Data pipeline CLI (scrape, transform) |
| Analytics Core   | `packages/analytics-core/`   | Shared analytics computation library  |
| Shared Contracts | `packages/shared-contracts/` | Data contracts (types + Zod schemas)  |

## Tooling

| Tool          | Command                      | Notes                                                   |
| ------------- | ---------------------------- | ------------------------------------------------------- |
| Test runner   | `npm run test`               | Vitest — all workspaces                                 |
| Watch mode    | `npm run test:watch`         |                                                         |
| Coverage      | `npm run test -- --coverage` |                                                         |
| Formatting    | `npm run format`             | Prettier — no semicolons, single quotes, 2-space indent |
| Linting       | `npm run lint`               | ESLint + YAML lint                                      |
| Type checking | `npm run typecheck`          | TypeScript strict mode                                  |

## Coverage Policy

All workspaces enforce minimum coverage thresholds via Vitest:

| Metric   | Minimum |
| -------- | ------- |
| Lines    | 50%     |
| Branches | 40%     |

Coverage is checked on every `git push` and in CI. PRs that reduce coverage below the floor are rejected.

## Quality Gates

### Pre-commit (every commit)

- Prettier formatting (lint-staged)
- TypeScript type checking
- ESLint + YAML lint
- Full test suite

### Pre-push (every push)

- Full test suite **with coverage enforcement**

### CI/CD Pipeline

- Quality gates (TypeScript, lint, format)
- Full test suite with coverage thresholds
- Security scanning
- Build verification
- Lighthouse CI on frontend changes
