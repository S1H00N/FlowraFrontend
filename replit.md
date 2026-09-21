# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

The product frontend is `artifacts/flowra-web`, which calls the external Flowra API through `VITE_API_BASE_URL` (including `/api/v1`). See [the documentation index](docs/README.md) for the current backend contracts and frontend integration status. The Express server in `artifacts/api-server` and `lib/api-spec/openapi.yaml` describe only the separate local `/api/healthz` endpoint; they do not implement or generate the external product API.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

Use `pnpm.cmd` in Windows PowerShell if execution policy blocks the PowerShell shim. Run `pnpm.cmd --filter @workspace/flowra-web run test:api` for frontend contract regression tests and consult [browser QA](docs/qa/README.md) for UI verification.
