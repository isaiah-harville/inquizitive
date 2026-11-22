import type { SqlDriver } from './driver';
import { migrate } from './migrate';
import { createTauriDriver, isTauri } from './tauri-driver';

let driver: Promise<SqlDriver> | null = null;

/**
 * The app-wide database handle. On desktop the Rust side has already applied
 * migrations before the window opens; in the browser we migrate here.
 */
export function getDb(): Promise<SqlDriver> {
  driver ??= (async () => {
    if (isTauri()) return createTauriDriver();
    const { createWebDriver } = await import('./web-driver');
    const web = await createWebDriver();
    await migrate(web);
    return web;
  })();
  driver.catch(() => {
    driver = null; // allow retry after a failed open
  });
  return driver;
}

export type { SqlDriver } from './driver';
