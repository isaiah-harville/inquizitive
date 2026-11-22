# Inquizitive

**An open-source, offline-first study app.** Make flashcard sets, study them five
ways, and remember them for good with spaced repetition. No accounts, no
subscriptions, no tracking.

Run it as a **desktop app** (your library is a SQLite file on your computer), or
**host it for a school or university** (Docker / Kubernetes) with pluggable
storage and single sign-on.

- **Study modes:** Flashcards · Learn (adaptive, round-based mastery) · Practice tests ·
  Match (timed game) · Spaced review (FSRS)
- **Fast authoring:** autosaving editor, keyboard-first (`Tab` / `Ctrl+Enter`),
  drag-to-reorder, bulk edit, images, Markdown, LaTeX and code
- **Import anything:** paste text and choose how terms and cards are separated
  (tab, comma, dash, custom…), CSV/TSV with column mapping, or full library archives
- **Own your data:** export a set or your whole library (with images and history) to a
  versioned ZIP; restore without ever overwriting
- **Desktop ↔ server sync:** link the desktop app to your account on a server with a device token
- **Search, folders, tags, stats, streaks, light and dark themes**

## Quick start

### Desktop app

```bash
bun install
bun run desktop:dev        # development window with hot reload
bun run desktop:build      # release bundle in src-tauri/target/release/bundle/
```

Requires [Bun](https://bun.sh), [Rust](https://rustup.rs) and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

### Self-hosted server (single container)

```bash
docker run -d -p 3000:3000 -v inquizitive-data:/data ghcr.io/isaiah-harville/inquizitive:latest
```

Open <http://localhost:3000>. The first account you create becomes the administrator.

### Self-hosted server (PostgreSQL + S3, scalable)

```bash
cp .env.example .env
docker compose up -d --build
```

For Kubernetes: `helm install study oci://ghcr.io/isaiah-harville/charts/inquizitive` (source in [`chart/inquizitive`](chart/inquizitive)).
Desktop builds are attached to each [GitHub release](https://github.com/isaiah-harville/inquizitive/releases).
Configuration, auth providers and scaling are covered in
[docs/self-hosting.md](docs/self-hosting.md).

### Web development

```bash
bun install
bun run dev                # http://localhost:3000 (server mode, SQLite in ./data)
```

## Documentation

| | |
|---|---|
| [docs/architecture.md](docs/architecture.md) | How the pieces fit: domain, API, storage drivers, platforms |
| [docs/development.md](docs/development.md) | Local setup, testing, building and packaging |
| [docs/self-hosting.md](docs/self-hosting.md) | Docker, Kubernetes, PostgreSQL, S3, OIDC / SSO |
| [docs/data-format.md](docs/data-format.md) | Import formats and the portable archive format |
| [docs/sync.md](docs/sync.md) | Syncing the desktop app with a server |
| [docs/adr/](docs/adr) | Architecture decision records |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [examples/](examples) | Sample files to try the importer with |

## Privacy

Inquizitive makes no network requests of its own: no telemetry, analytics, CDNs or
remote fonts. The desktop app only goes online to sync with a server you choose. Imported content is rendered safely: raw HTML is never executed, and
external images or links in cards are never loaded. The end-to-end tests fail if the
app tries to reach any host other than itself.

## Known limitations

- **Desktop UI automation:** the desktop bundle has been built, launched and checked
  to open its database, but the UI flows are tested end to end in the web build
  (the same code). Adding `tauri-driver` WebDriver tests on Linux/Windows CI would
  close that gap.
- **Nested folders:** the schema supports `parent_id`; the UI shows one level.
- **Passwords:** users can't change their own password yet (admins can reset it).
- **Image editing:** one image per card side; no cropping or occlusion.
- **Sync** compares edit times from both machines; keep clocks set automatically.
  Unfinished study sessions don't sync.
- **Rate limiting** of sign-in attempts should be done at the reverse proxy or ingress
  for now.
- **Accessibility:** keyboard navigation and labels throughout; a full screen-reader
  audit is still to do.

## License

[MIT](LICENSE)
