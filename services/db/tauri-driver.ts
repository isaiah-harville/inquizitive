import { invoke } from '@tauri-apps/api/core';
import type { Row, SqlDriver, SqlParam, Stmt } from './driver';

/** Desktop driver: SQL runs in Rust (rusqlite) over Tauri IPC. */
export function createTauriDriver(): SqlDriver {
  return {
    dialect: 'sqlite',
    select: <T = Row>(sql: string, params: SqlParam[] = []) =>
      invoke<T[]>('db_select', { sql, params }),
    execute: (sql: string, params: SqlParam[] = []) =>
      invoke<number>('db_execute', { sql, params }),
    batch: (statements: Stmt[]) =>
      invoke<number>('db_batch', {
        statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
      }),
  };
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
