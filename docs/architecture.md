# Architecture

Inquizitive is one TypeScript codebase that runs in three shapes:

| Shape | UI | API runs in | Database | Images | Users |
|---|---|---|---|---|---|
| **Desktop** (Tauri) | static export in a webview | the webview | SQLite via Rust (rusqlite) | app data folder | one built-in local user |
| **Server** (Docker/K8s) | Next.js server | Node, behind `/api/rpc` | SQLite file **or** PostgreSQL | directory **or** S3 | real accounts (none/local/OIDC/proxy) |
| **Browser only** (`build:browser`) | static export | the browser | SQLite WASM, snapshotted to IndexedDB | IndexedDB | one local user |

```
┌──────────────────────────── UI (Next.js App Router, React, shadcn/ui) ───────────────────────────┐
│ app/(main)/…   library, set page, editor, import, stats, settings      app/(study)/study/…  modes │
└──────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                               │  getApi()  (services/api/client.ts)
                     ┌─────────────────────────┴──────────────────────────┐
              in-process (desktop / browser)                  HTTP RPC (server)
                     │                                                    │ POST /api/rpc → server/rpc.ts
                     ▼                                                    ▼  (zod-validated, allow-listed)
            ┌──────────────── createCoreApi(db, user)  services/api/core.ts ────────────────┐
            │  authorization (owner / shared / admin) · one method per user action          │
            └───────────────┬───────────────────────────────────────────────┬───────────────┘
                            ▼                                               ▼
        services/repositories/*  (portable SQL)                 domain/*  (pure, deterministic)
                            │                                    grading · question generation ·
                            ▼                                    learn · test · match · FSRS · stats
                    SqlDriver interface (services/db/driver.ts)
        ┌──────────────┬────────────────┬──────────────────┬─────────────────┐
        │ Tauri → Rust │ node:sqlite    │ PostgreSQL (pg)  │ SQLite WASM     │
        │ (desktop)    │ (server/tests) │ (server)         │ (browser)       │
        └──────────────┴────────────────┴──────────────────┴─────────────────┘
```

## Layers

- **`domain/`**: pure functions with no I/O and no React. Answer grading, distractor
  selection, question building, the Learn state machine, test building and grading,
  the match board, flashcard sessions, streaks, and the FSRS wrapper. Everything
  random takes an explicit seed, so it is reproducible and unit-tested.
- **`services/repositories/`**: SQL for each aggregate (sets, cards, progress,
  sessions, stats, search, users). It is written once in a portable subset with `?`
  placeholders. The few dialect differences (list aggregation, full-text search,
  date bucketing) branch on `db.dialect`.
- **`services/api/core.ts`**: the application API. Every UI action goes through it,
  and it enforces authorization. The desktop app uses it in-process; the server
  exposes it over `/api/rpc` with per-method argument validation (`server/rpc.ts`).
- **`services/import-export/`**: the delimited-text parser (paste/CSV/TSV), CSV export,
  the native bundle (versioned JSON, zod-validated) and ZIP archives.
- **`server/`**: server-only code. Config, the database and blob-store factories,
  auth (scrypt passwords, DB-backed sessions, OIDC, proxy headers), and the RPC
  dispatcher. Route handlers are named `route.server.ts` so the static (desktop)
  export never includes them.
- **`src-tauri/`**: the desktop shell. It opens SQLite (WAL, foreign keys), backs the
  file up before any migration, runs migrations, and exposes a small command set:
  parameterized `db_select` / `db_execute` / atomic `db_batch`, plus sandboxed
  media read/write that only accepts generated `<uuid>.<image-ext>` names.

## Data model

Content (sets, cards) is separate from per-user learning state (progress,
reviews, sessions, attempts), so a shared set can be studied by a whole class.
See `migrations/sqlite/0001_init.sql`. Key tables:

`users`, `auth_sessions`, `folders`, `study_sets` (owner, visibility, archived, deleted),
`set_activity` (per-user recent/studied), `flashcards`, `accepted_answers`, `tags`,
`study_set_tags`, `card_media`, `card_progress` (per user: star, known, FSRS state, due),
`review_events`, `study_sessions` (resumable JSON state), `study_attempts`,
`match_records`, `user_settings`. Search uses FTS5 (SQLite) or generated `tsvector`
columns (PostgreSQL).

Migrations live in `migrations/<dialect>/NNNN_name.sql`. Rust embeds the SQLite
files; `scripts/gen-migrations.ts` embeds both dialects for TypeScript. The test
suite runs against both databases.

## Study algorithms

- **Grading:** normalizes case, accents, punctuation and Markdown; accepts listed
  alternatives; treats `(parentheticals)` as optional; forgives small typos in words
  (never in numbers).
- **Learn:** each card climbs mastery levels 0 → 1 → 2. New cards get recognition
  questions (true/false, multiple choice); familiar cards get recall questions (written,
  flashcard). A miss drops a level and the card comes back two questions later in the
  same round. Each round favors missed cards, then cards in progress, then new ones.
- **Distractors:** drawn from the set's other answers, never equal to any accepted
  answer, de-duplicated, and preferring similar length and type (numeric vs. text).
- **Spaced repetition:** FSRS via `ts-fsrs` (MIT). It is independent of the
  flashcard-mode known/unknown marks and of temporary session progress.
