# 0001. Build the frontend with Next.js and React

- Status: Accepted
- Date: 2026-11-22

## Context

The hl standards call for Vite (SvelteKit for apps) on the web. The project owner asked for Next.js for this project. The app has to ship as a Tauri desktop app and as a hosted server from one codebase. The UI is built on shadcn/ui and Radix primitives.

## Decision

Use Next.js 16 (App Router) with React and TypeScript. `INQUIZITIVE_TARGET=static` produces a static export for Tauri; the default target produces a standalone server whose API routes are named `route.server.ts`, so the static export never includes them.

## Alternatives considered

- **Vite + React with a separate API server**: two build systems and two deployables for the hosted shape.
- **SvelteKit (the hl default)**: not what the owner asked for, and the shadcn/ui React components the UI uses would need replacing.

## Consequences

- Pages that take ids use query parameters, because a static export can't prerender `[id]` routes.
- Next.js 16 changes APIs often; agents read `node_modules/next/dist/docs/` first.
- Two `next dev` processes in one folder fight over `next-env.d.ts`, so e2e tests run against the production build.
