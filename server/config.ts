import { z } from 'zod';

/** Boolean env var ("true"/"1"), falling back to `fallback` when unset. */
const flag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? fallback : v === '1' || v.toLowerCase() === 'true',
    );

const schema = z.object({
  /** sqlite:./data/inquizitive.db | postgres://user:pass@host:5432/db */
  DATABASE_URL: z.string().default('sqlite:./data/inquizitive.db'),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(10),
  NODE_ENV: z.string().default('development'),
  /** Media storage: "fs" (local directory) or "s3" (any S3-compatible service). */
  STORAGE_DRIVER: z.enum(['fs', 's3']).default('fs'),
  STORAGE_DIR: z.string().default('./data/media'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Use path-style URLs (needed for MinIO/SeaweedFS/Garage). */
  S3_FORCE_PATH_STYLE: flag(true),
  S3_PREFIX: z.string().default(''),

  /** none | local | oidc | proxy */
  AUTH_MODE: z.enum(['none', 'local', 'oidc', 'proxy']).default('local'),
  /** Let anyone create a local account (otherwise only admins can add users). */
  ALLOW_SIGNUP: flag(false),
  /** Bootstrap admin created on first start (local auth). */
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .positive()
    .default(24 * 14),
  /** Public base URL, e.g. https://study.example.edu (needed for OIDC redirects and secure cookies). */
  APP_URL: z.string().url().optional(),

  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_SCOPES: z.string().default('openid profile email'),
  /** Comma-separated email domains allowed to sign in (empty = any). */
  OIDC_ALLOWED_DOMAINS: z.string().default(''),
  /** Claim containing groups/roles, and the value that grants admin. */
  OIDC_ADMIN_CLAIM: z.string().default('groups'),
  OIDC_ADMIN_VALUE: z.string().optional(),
  OIDC_PROVIDER_NAME: z.string().default('Single sign-on'),

  /** Trusted header set by an authenticating reverse proxy (AUTH_MODE=proxy). */
  PROXY_USER_HEADER: z.string().default('x-forwarded-user'),
  PROXY_EMAIL_HEADER: z.string().default('x-forwarded-email'),
  PROXY_NAME_HEADER: z.string().default('x-forwarded-preferred-username'),

  /** FSRS target retention for the whole instance. */
  FSRS_RETENTION: z.coerce.number().min(0.7).max(0.97).default(0.9),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
});

export type ServerConfig = z.infer<typeof schema> & { dbKind: 'sqlite' | 'postgres' };

let cached: ServerConfig | null = null;

export function serverConfig(): ServerConfig {
  if (cached) return cached;
  // Compose/Helm often pass unset variables as empty strings: treat those as unset.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid Inquizitive server configuration: ${msg}`);
  }
  const c = parsed.data;
  const dbKind = /^postgres(ql)?:\/\//.test(c.DATABASE_URL) ? 'postgres' : 'sqlite';
  if (
    c.STORAGE_DRIVER === 's3' &&
    !(c.S3_BUCKET && c.S3_ENDPOINT && c.S3_ACCESS_KEY_ID && c.S3_SECRET_ACCESS_KEY)
  ) {
    throw new Error(
      'STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
    );
  }
  if (c.AUTH_MODE === 'oidc' && !(c.OIDC_ISSUER && c.OIDC_CLIENT_ID && c.APP_URL)) {
    throw new Error('AUTH_MODE=oidc needs OIDC_ISSUER, OIDC_CLIENT_ID and APP_URL');
  }
  cached = { ...c, dbKind };
  return cached;
}

/** Public, non-secret facts the browser needs (login page, feature flags). */
export function publicConfig() {
  const c = serverConfig();
  return {
    authMode: c.AUTH_MODE,
    allowSignup: c.AUTH_MODE === 'local' && c.ALLOW_SIGNUP,
    oidcProviderName: c.OIDC_PROVIDER_NAME,
    maxUploadMb: c.MAX_UPLOAD_MB,
  };
}
