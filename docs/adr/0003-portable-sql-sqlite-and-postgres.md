# 0003. Portable SQL on SQLite and PostgreSQL

- Status: Accepted
- Date: 2026-11-22

## Context

The desktop app needs an embedded database. A clustered school deployment needs a shared one. An ORM would add a large dependency and still need per-dialect search.

## Decision

Repositories are written once in portable SQL with `?` placeholders against a small `SqlDriver` interface (`select`, `execute`, atomic `batch`). Drivers exist for Tauri/rusqlite, `node:sqlite`, `pg` (placeholders rewritten to `$n`) and SQLite WASM. Only full-text search (FTS5 vs. `tsvector`), list aggregation and date bucketing branch on `db.dialect`. Migrations are plain SQL files per dialect, kept in step, and tracked with `PRAGMA user_version` (SQLite) or `schema_migrations` under an advisory lock (PostgreSQL).

## Alternatives considered

- **Drizzle or Kysely**: typed queries, but a heavy dependency and a custom driver for the Tauri bridge, with search still dialect-specific.
- **PostgreSQL only, PGlite on desktop**: larger desktop footprint and less mature than SQLite.

## Consequences

- Every schema change ships two migration files.
- The integration suite runs on both engines (`bun run test`, `bun run test:pg`); CI runs both.
