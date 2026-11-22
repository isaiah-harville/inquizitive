import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const src = join(root, 'node_modules', '@sqlite.org', 'sqlite-wasm', 'dist');
const dest = join(root, 'public', 'sqlite');
mkdirSync(dest, { recursive: true });
const files = readdirSync(src).filter((f) => /\.(mjs|js|wasm)$/.test(f) && f !== 'node.mjs');
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log(`copied ${files.length} SQLite WASM files to public/sqlite/`);
