import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACTS, ROOT, downloadBase } from './project.mjs';

export const VERSION_FILE = path.join(ROOT, 'website', 'public', 'version.json');

/** `details` holds { size, sha256 } for the installer and the portable build. */
export function writeVersionFile({ version, published, date, details }) {
  const files = {};
  for (const [kind, name] of Object.entries(ARTIFACTS)) {
    files[kind] = { name, url: downloadBase + name, size: details[kind].size, sha256: details[kind].sha256 };
  }
  fs.writeFileSync(VERSION_FILE, `${JSON.stringify({ version, published, date, files }, null, 2)}\n`);
}
