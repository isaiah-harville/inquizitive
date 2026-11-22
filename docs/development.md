# Development

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (package manager and scripts)
- Node.js 22.13+ (Next.js and `node:sqlite`)
- For the desktop app: [Rust](https://rustup.rs) stable and the
  [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)
- Optional: Docker (PostgreSQL tests, container builds)

```bash
bun install
```

## Running

| Command | What it does |
|---|---|
| `bun run dev` | Web app in server mode at <http://localhost:3000>, SQLite in `./data` |
| `bun run desktop:dev` | Desktop window (Tauri) with hot reload |
| `AUTH_MODE=none bun run dev` | Server mode without sign-in |

Server settings come from environment variables or `.env.local`; see
[`.env.example`](../.env.example).

## Tests

| Command | Covers |
|---|---|
| `bun run test` | Unit tests (algorithms, parsers, archive) and integration tests (repositories, API authorization, export/restore) on in-memory SQLite |
| `TEST_DATABASE_URL=postgres://… bun run test` | The same integration tests on PostgreSQL. **The database's `public` schema is wiped.** |
| `bun run test:rust` | Rust: migrations, foreign keys, FTS triggers, atomic batches, media sandboxing, pre-migration backup |
| `bun run test:e2e` | Playwright end to end: editor, import, flashcards, learn and resume, test, match, search, and no external requests. First run `bunx playwright install chromium`, or use an installed Chrome with `PW_CHANNEL=chrome`. |
| `bun run check` | lint + typecheck + unit/integration + Rust |

Quick PostgreSQL for tests:

```bash
docker run -d --rm --name iq-pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres bun run test
```

## Lint and format

```bash
bun run lint            # Biome (TypeScript/React)
bun run format
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

`components/ui/` holds vendored shadcn/ui components. Add more with
`bunx shadcn@latest add <name>`.

## Builds

| Command | Output |
|---|---|
| `bun run build:web` | Static export in `out/` used by the desktop app |
| `bun run desktop:build` | Native bundles in `src-tauri/target/release/bundle/` (`.app`/`.dmg`, `.msi`/`.exe`, `.deb`/`.AppImage`/`.rpm`) |
| `bun run build:server` | Standalone server in `.next/standalone/` (run with `node server.js`; copy `.next/static` and `public` next to it, as the Dockerfile does) |
| `bun run build:browser` | Static web build that keeps data in the browser (no server) |
| `docker build -t inquizitive .` | Server container |

## Schema changes

1. Add `migrations/sqlite/NNNN_description.sql` **and** the matching
   `migrations/postgres/NNNN_description.sql`.
2. Add the SQLite file to `MIGRATIONS` in `src-tauri/src/database/mod.rs`.
3. `bun run prepare:assets` regenerates `services/db/migrations.gen.ts`.
4. Never edit a migration that has shipped. The desktop app backs up the database
   before applying new migrations.

## Adding an API method

1. Add it to `createCoreApi` (`services/api/core.ts`), including the authorization check.
2. Add its argument schema to `ARGS` in `server/rpc.ts`. The compiler enforces
   that every method has one.
3. Call it from the UI with `useApiQuery` or `useAction` (`hooks/use-api.ts`).
