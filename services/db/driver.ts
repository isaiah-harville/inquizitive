export type SqlParam = string | number | boolean | null;
export type Row = Record<string, unknown>;

export interface Stmt {
  sql: string;
  params?: SqlParam[];
}

export type Dialect = 'sqlite' | 'postgres';

export interface SqlDriver {
  /**
   * SQL is written with `?` placeholders and portable syntax; the few
   * dialect-specific fragments are chosen with `db.dialect`.
   */
  readonly dialect: Dialect;
  select<T = Row>(sql: string, params?: SqlParam[]): Promise<T[]>;
  /** Run one write statement; resolves to the number of changed rows. */
  execute(sql: string, params?: SqlParam[]): Promise<number>;
  /** Run statements atomically in one transaction. */
  batch(statements: Stmt[]): Promise<number>;
}

/** Drivers that manage their own schema (browser, tests) also support scripts. */
export interface ScriptableDriver extends SqlDriver {
  execScript(sql: string): Promise<void>;
  /** Run `fn` on one pinned connection (pooled drivers); others just call `fn(this)`. */
  session?<T>(fn: (db: ScriptableDriver) => Promise<T>): Promise<T>;
}

export function stmt(sql: string, ...params: SqlParam[]): Stmt {
  return { sql, params };
}
