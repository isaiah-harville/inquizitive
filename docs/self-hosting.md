# Self-hosting

The server build is a single stateless Node process (UI + API). Everything else is
pluggable and set through environment variables (see [`.env.example`](../.env.example)).

## Choosing a shape

| Size | Database | Images | Replicas |
|---|---|---|---|
| A class, a club, a home lab | SQLite on a volume (default) | directory on the same volume | 1 |
| A school or university | PostgreSQL | S3-compatible bucket | 2+ behind a load balancer |

With PostgreSQL and S3 the app keeps no local state. Sessions live in the database,
so any replica can serve any request and you can scale horizontally. Migrations run
at startup under a PostgreSQL advisory lock, so replicas can start together.

## Docker

Single container, SQLite:

```bash
docker run -d --name inquizitive -p 3000:3000 -v inquizitive-data:/data \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='a-long-password' \
  inquizitive
```

Full stack (app + PostgreSQL 17 + SeaweedFS S3):

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, S3 keys, AUTH_MODE…
docker compose up -d --build
```

## Kubernetes (Helm)

```bash
# Simple: one replica, SQLite on a PersistentVolume
helm install study chart/inquizitive --set appUrl=https://study.example.edu \
  --set ingress.enabled=true --set ingress.hosts[0].host=study.example.edu

# Scalable: PostgreSQL + S3, autoscaling
helm install study chart/inquizitive \
  --set appUrl=https://study.example.edu \
  --set database.existingSecret=inquizitive-db \
  --set storage.driver=s3 --set storage.s3.endpoint=https://s3.example.edu \
  --set storage.s3.existingSecret=inquizitive-s3 \
  --set persistence.enabled=false --set autoscaling.enabled=true \
  --set auth.mode=oidc --set auth.oidc.issuer=https://login.example.edu/realms/school \
  --set auth.oidc.clientId=inquizitive --set auth.existingSecret=inquizitive-oidc
```

The chart refuses `replicaCount > 1` with SQLite or local images unless you supply a
ReadWriteMany volume, because SQLite must have a single writer.

## Database

| `DATABASE_URL` | |
|---|---|
| `sqlite:/data/inquizitive.db` | default in the container |
| `postgres://user:pass@host:5432/inquizitive` | PostgreSQL 13+ (tested on 17) |

`DATABASE_POOL_SIZE` (default 10) sets connections per replica.

## Image storage

| `STORAGE_DRIVER` | Settings |
|---|---|
| `fs` | `STORAGE_DIR` (default `/data/media`) |
| `s3` | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_FORCE_PATH_STYLE` (true for MinIO/SeaweedFS/Garage/Ceph), `S3_PREFIX` |

The bucket is created on first start if it's missing and the credentials allow it.
Uploads are checked by their real file type (PNG, JPEG, GIF, WebP, AVIF), capped by
`MAX_UPLOAD_MB`, and only served to users who can see the card they belong to.

## Authentication

| `AUTH_MODE` | Use it for |
|---|---|
| `local` (default) | Username + password accounts. The first account becomes admin. `ALLOW_SIGNUP=true` lets anyone register; otherwise admins add users on the Admin page. `ADMIN_USERNAME`/`ADMIN_PASSWORD` create an admin at first start. |
| `oidc` | Single sign-on with any OpenID Connect provider (Keycloak, Microsoft Entra ID, Google Workspace, Authentik, Okta…). Needs `APP_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID` and usually `OIDC_CLIENT_SECRET`. Register the redirect URI `APP_URL/api/auth/oidc/callback`. Limit who can sign in with `OIDC_ALLOWED_DOMAINS`, and grant admin from a claim with `OIDC_ADMIN_CLAIM` + `OIDC_ADMIN_VALUE`. |
| `proxy` | Behind an authenticating reverse proxy (oauth2-proxy, Authelia, Pomerium…) that sets `PROXY_USER_HEADER` (default `X-Forwarded-User`). **Only expose the app through that proxy**, because the header is trusted. |
| `none` | No sign-in; everyone shares one library. Personal or LAN use only. |

Passwords are hashed with scrypt. Sessions are random 256-bit tokens stored only as
SHA-256 hashes, in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` when `APP_URL` is
https). State-changing requests must come from the app's own origin.

## Sharing in a school

Each set is **private** (default) or **shared with everyone on the server**. Shared sets
appear under *Shared sets*. Anyone can study them, and progress is tracked per person.
Only the owner (or an admin) can edit one. Anyone can *Copy to my library* and make a
version of their own.

## Backups

- PostgreSQL: your usual `pg_dump` and point-in-time recovery.
- SQLite: back up `/data`. A consistent copy: `sqlite3 /data/inquizitive.db ".backup /backup/iq.db"`.
- Users can also export their own library as a portable archive from *Settings → Backup & export*.

## Health checks

`GET /api/health/` returns 200 when the app can reach its database. The container
image and Helm chart use it for readiness and liveness.
