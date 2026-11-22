# 0005. Pluggable storage and authentication for hosting

- Status: Accepted
- Date: 2026-11-22

## Context

Schools and universities run anything from a single container to a Kubernetes cluster with existing SSO and object storage.

## Decision

All server settings come from environment variables validated in `server/config.ts`. Storage is SQLite or PostgreSQL (`DATABASE_URL`) and a directory or any S3-compatible bucket (`STORAGE_DRIVER`, signed with `aws4fetch`). Auth is `none`, `local` (scrypt passwords), `oidc` (`openid-client`, PKCE) or `proxy` (trusted header). Sessions are random tokens stored hashed in the database, so replicas share no memory. The Helm chart refuses multiple replicas with SQLite or local images.

## Alternatives considered

- **SAML**: universities mostly offer OIDC today, and proxies such as oauth2-proxy cover the rest through `proxy` mode.
- **Stateless JWT sessions**: no server-side revocation when an admin disables an account.

## Consequences

- With PostgreSQL and S3 the app is stateless and scales horizontally.
- Sign-in rate limiting is left to the ingress or reverse proxy for now.
