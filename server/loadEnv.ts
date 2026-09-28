import fs from 'fs';
import path from 'path';

/**
 * Robust environment variable loader for Node.js server and scripts.
 * Loads .env and .env.local without external dependencies,
 * and sets up aliases between SUPABASE_* and VITE_SUPABASE_*.
 */
export function loadEnvFiles() {
  if (typeof process === 'undefined' || !process.cwd) return;

  const cwd = process.cwd();
  const envFiles = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local')
  ];

  for (const file of envFiles) {
    if (!fs.existsSync(file)) continue;
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;

          // Auto-bridge VITE_ and standard keys
          if (key.startsWith('SUPABASE_')) {
            const viteKey = `VITE_${key}`;
            if (!process.env[viteKey]) {
              process.env[viteKey] = val;
            }
          } else if (key.startsWith('VITE_SUPABASE_')) {
            const standardKey = key.replace(/^VITE_/, '');
            if (!process.env[standardKey]) {
              process.env[standardKey] = val;
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[loadEnv] Failed to read ${file}:`, e);
    }
  }
}

// Auto-run on import
loadEnvFiles();
