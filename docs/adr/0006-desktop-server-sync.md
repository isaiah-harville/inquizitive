# 0006. Desktop-to-server sync

- Status: Accepted
- Date: 2026-11-22

## Context

People study on a desktop app offline and also want their sets on a school or homelab server. Until now, archive export and import was the only way to move data between them. Invariant 1 ("no external network requests") has to bend for this, but only toward a server the user chooses.

## Decision

The desktop app syncs the local user's own library (folders, sets, tags, cards, answers, images, progress and review history) with one server account.

- **Linking:** the user creates a device token in the server's web settings (`POST /api/devices`, browser session only) and pastes it, with the server address, into the desktop app. Tokens are random 256-bit strings stored as SHA-256 hashes in `api_tokens` and sent as `Authorization: Bearer`. Bearer requests skip the Origin check because they carry no ambient credentials.
- **Protocol:** `POST /api/sync` with `{op: "manifest"}` returns ids and `updated_at` for everything the user owns, plus tombstones. The pure planner `planSync` (`domain/sync.ts`) decides per row: the newer `updated_at` wins, and a deletion wins over edits made before it. A second request `{op: "apply"}` sends the rows to push and the ids to pull. Both sides apply rows with the same `applyRows`, which never takes over a row owned by another user.
- **Deletions:** `AFTER DELETE` triggers on folders, sets and cards write `sync_tombstones` in both dialects (migration 0002).
- **Images:** files are uploaded through `/api/media?name=` (never overwriting) and downloaded the same way.
- **Transport:** the desktop calls the server through `tauri-plugin-http` from Rust, so the webview CSP stays `connect-src 'self'`. Its scope allows any http(s) URL because the address is user-entered; requests go only to the configured server.
- **Schedule:** sync runs at launch, every 15 minutes, and on demand.

## Alternatives considered

- **A change log with server sequence numbers:** exact incremental sync, but a sequence column or log table on every synced table. The manifest is a few hundred KB for tens of thousands of cards, which is fine for one person's library.
- **CRDTs or field-level merges:** more precise, but heavier than flashcards need. Row-level last-writer-wins is easy to explain.
- **Syncing from the webview with `fetch`:** needs CORS on the server and a looser desktop CSP.

## Consequences

- Invariant 1 now reads: no requests except to the sync server the user configures.
- Timestamps come from two clocks; a badly wrong desktop clock can make older edits win. Sync reports this case nowhere yet.
- Only sets the user owns sync. Sets shared by others stay on the server.
- The desktop stores the token in its local database, the same place as the library it unlocks.
- Every mutation must bump `updated_at` (including archive, trash, reorder and image changes) or the change won't sync.
