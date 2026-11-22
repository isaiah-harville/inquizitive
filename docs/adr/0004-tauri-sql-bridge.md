# 0004. Desktop data access through a parameterized SQL bridge

- Status: Accepted
- Date: 2026-11-22

## Context

ADR 0003 keeps one TypeScript data layer. On desktop that layer has to reach SQLite in Rust. `tauri-plugin-sql` offers the same model but no transactions across calls.

## Decision

The Rust side exposes `db_select`, `db_execute` and `db_batch` (one transaction), with JSON scalars as bound parameters, plus `media_read/write/remove`, which accept only generated `<uuid>.<image-ext>` names inside the app's media folder. Rust opens the database with WAL and foreign keys, and copies it before applying migrations.

## Alternatives considered

- **One Tauri command per operation**: a second implementation of every repository in Rust.
- **`tauri-plugin-sql`**: no atomic multi-statement writes.

## Consequences

- The webview can run arbitrary SQL against the user's own database. That's acceptable because the webview only loads bundled code under a strict CSP, and user content renders without HTML (invariant 2 in AGENTS.md).
- New Rust commands need an ADR.
