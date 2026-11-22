# Contributing to Inquizitive

Thanks for helping! Inquizitive is MIT-licensed, and contributions are accepted
under the same license.

## Getting set up

See [docs/development.md](docs/development.md). In short:

```bash
bun install
bun run dev          # web/server mode
bun run desktop:dev  # desktop app
bun run check        # lint, typecheck, tests (TS + Rust)
```

## Guidelines

- **Use Bun for Node tooling** (`bun add`, `bun run`) and commit `bun.lock`.
- **Keep study logic pure.** Algorithms belong in `domain/`, with an explicit seed for
  anything random and unit tests for new behavior.
- **All data access goes through `services/api/core.ts`**, including authorization.
  New API methods also need an argument schema in `server/rpc.ts`.
- **Schema changes** need a SQLite *and* a PostgreSQL migration. Run the
  integration tests against both (see docs).
- **No network calls, telemetry or remotely hosted assets.** The e2e suite enforces this.
- **Render user content safely**: use `<RichText>`, never `dangerouslySetInnerHTML`.
- **Accessibility:** every control needs a label and must work from the keyboard.
- Format with Biome (`bun run format`) and `cargo fmt`; CI runs lint, types, tests,
  builds and e2e.
- Use conventional commit messages (`feat:`, `fix:`, `docs:`…).

## Reporting bugs

Please include your platform (desktop OS or server setup), the steps to reproduce,
and, if it's about importing, a small sample file.
