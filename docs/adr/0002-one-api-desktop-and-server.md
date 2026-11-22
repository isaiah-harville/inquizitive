# 0002. One application API for desktop and server

- Status: Accepted
- Date: 2026-11-22

## Context

The app must work fully offline on a desktop and also run as a multi-user server for a school. Duplicating business logic and authorization per platform would drift.

## Decision

All UI actions go through `createCoreApi(db, user)` in `services/api/core.ts`, which also enforces authorization. The desktop and browser-only builds call it in-process with the built-in `local` user. The server exposes it at `POST /api/rpc`, where `server/rpc.ts` allow-lists methods and validates every argument list with zod before dispatching for the signed-in user.

## Alternatives considered

- **REST endpoints per resource**: more code per feature, and a second path the desktop wouldn't use.
- **Separate desktop and server data layers**: two implementations of every rule.

## Consequences

- Every new API method needs an argument schema in `server/rpc.ts`; the compiler enforces that each method has one.
- The desktop gets multi-user-safe code for free; a single user is just one row in `users`.
