# AGENTS.md

Guide for AI coding agents and the humans reviewing their work in this repository. The shared standards (the `AGENTS.md` of the hl agents plugin) apply too. This file adds to them and can tighten them; it departs from one only where an ADR in `docs/adr/` says so.

## What this repo is

Inquizitive is an open-source, offline-first study app: flashcard sets studied through flashcards, Learn, practice tests, Match and FSRS spaced review. One Next.js codebase ships as a Tauri desktop app (static export, local SQLite) and as a self-hosted server for schools (Docker image and Helm chart, SQLite or PostgreSQL, disk or S3, none/local/OIDC/proxy auth). See [docs/architecture.md](docs/architecture.md).

## Commands

```sh
bun install              # install dependencies
bun run db:up            # PostgreSQL 17 in Docker for test:pg (bun run db:down to stop)
bun run check            # everything CI runs except e2e and builds; must pass before every commit
bunx vitest run tests/unit/learn.test.ts   # a single test file
PW_CHANNEL=chrome bun run test:e2e         # Playwright against the production server build
bun run dev              # server mode at http://localhost:3000 (SQLite in ./data)
bun run desktop:dev      # desktop app
bun run format           # Biome; cargo fmt --manifest-path src-tauri/Cargo.toml for Rust
```

Builds: `bun run build:web` (static export for desktop), `bun run build:server` (standalone server), `bun run desktop:build`, `docker build .`.

## Layout

| Path | Owns | Must not |
|---|---|---|
| `domain/` | Pure, seeded study algorithms: grading, questions, Learn, tests, match, FSRS, streaks | Do I/O, import React, call `Math.random` without a seed parameter |
| `services/api/core.ts` | The only data API, and all authorization | Be bypassed by UI code calling repositories directly |
| `services/repositories/` | Portable SQL for SQLite and PostgreSQL (`?` placeholders) | Branch on dialect except for search, list aggregation and date bucketing |
| `services/import-export/` | Text/CSV parsing, CSV export, versioned bundle and ZIP archive | Overwrite existing data on import |
| `server/` | Server-only config, DB and blob-store factories, auth, RPC dispatch | Be imported from client components |
| `app/**/route.server.ts` | Server route handlers (excluded from the static export by `pageExtensions`) | Be named `route.ts` |
| `migrations/{sqlite,postgres}/` | Schema, one numbered file per change per dialect | Be edited after release |
| `src-tauri/` | Desktop shell: SQLite bridge commands, sandboxed media files | Grow commands beyond SQL + media without an ADR |
| `components/ui/` | Vendored shadcn/ui (`bunx shadcn@latest add <name>`) | Be hand-written |

## Invariants

These hold the system together. A change that breaks one needs an ADR in `docs/adr/` first.

1. **No external network requests.** No telemetry, CDNs, remote fonts or remote images. The e2e suite fails on any request off localhost.
2. **User content renders only through `<RichText>`.** Raw HTML is skipped; external images and links are never loaded.
3. **Imports never overwrite.** Existing ids are kept only when free; everything else becomes a copy.
4. **Authorization lives in `createCoreApi`.** Every method checks ownership/visibility; every RPC method has a zod schema in `server/rpc.ts`.
5. **Content is separate from per-user state.** Progress, reviews, sessions and settings are keyed by user, so shared sets work for a whole class.
6. **Both dialects stay in step.** Every migration exists for SQLite and PostgreSQL and the integration suite passes on both.

## How to make common changes

**Add an API method.** Add it to `createCoreApi` with its authorization check, add the argument tuple to `ARGS` in `server/rpc.ts`, call it from the UI with `useApiQuery` or `useAction` (`hooks/use-api.ts`), and add a case to `tests/integration/api.test.ts`.

**Change the schema.** Add `migrations/sqlite/NNNN_*.sql` and `migrations/postgres/NNNN_*.sql`, register the SQLite file in `MIGRATIONS` in `src-tauri/src/database/mod.rs`, run `bun run prepare:assets` to regenerate `services/db/migrations.gen.ts`, then `bun run test`, `bun run test:pg` and `bun run test:rust`.

**Add a study algorithm or question type.** Put the logic in `domain/` as pure functions taking a seed, unit-test it in `tests/unit/`, then wire the UI in `app/(study)/study/`.

**Add a server setting.** Add it to the schema in `server/config.ts` (the only place that reads `process.env` at runtime), `.env.example`, `docs/self-hosting.md` and `chart/inquizitive/values.yaml`.

## Conventions

- Next.js and React instead of the standard Vite/SvelteKit: see [ADR 0001](docs/adr/0001-nextjs-react-frontend.md).
- Next.js 16 changed APIs; read `node_modules/next/dist/docs/` before using one you haven't checked.
- Pages that take ids use query params (`/set/?id=`), not `[id]` segments, because of the static export.
- Integration tests run on SQLite and PostgreSQL. SQLite is a production engine here (desktop, single-node server), not a stand-in.

## Things not to do

- Don't add `[param]` route segments; the desktop export can't prerender them.
- Don't read `process.env` outside `server/config.ts` in runtime code.
- Don't add a runtime dependency without saying why in the PR.
- Don't run a second `next dev` in this folder; both rewrite `next-env.d.ts` and loop on reloads. E2E uses the production build for this reason.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
