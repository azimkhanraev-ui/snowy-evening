// npm run release: builds both .exe files, then writes version.json and SHA256SUMS.txt.
// The site enables its download buttons only for `published: true`. GitHub Actions passes
// --published, a local build does not, because nobody can download its files yet.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { ARTIFACTS, ROOT, pkg } from './project.mjs';
import { VERSION_FILE, writeVersionFile } from './version-file.mjs';

const output = path.join(ROOT, 'release');
// Remove old artifacts, otherwise a failed build could get the hashes of the previous one.
for (const name of Object.values(ARTIFACTS)) fs.rmSync(path.join(output, name), { force: true });

const builder = createRequire(import.meta.url).resolve('electron-builder/cli.js');
execFileSync(process.execPath, [builder, '--win', '--x64', '--publish', 'never'], { cwd: ROOT, stdio: 'inherit' });

// A packaged app can lack a file that exists in node_modules. `--quit` loads every module of the
// main process and exits, while a broken build hangs on an error dialog until the timeout.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'snowy-smoke-'));
try {
  const packaged = path.join(output, 'win-unpacked', `${pkg.productName}.exe`);
  execFileSync(packaged, ['--quit', `--user-data-dir=${scratch}`], { timeout: 60_000, stdio: 'ignore' });
} catch (error) {
  throw new Error('The packaged app does not start, the build must not be released', { cause: error });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

const details = {};
const sums = [];
for (const [kind, name] of Object.entries(ARTIFACTS)) {
  const data = fs.readFileSync(path.join(output, name));
  const sha256 = createHash('sha256').update(data).digest('hex');
  details[kind] = { size: data.length, sha256 };
  sums.push(`${sha256}  ${name}\n`);
}
fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), sums.join(''));

writeVersionFile({
  version: pkg.version,
  published: process.argv.includes('--published'),
  date: new Date().toISOString(),
  details,
});
fs.copyFileSync(VERSION_FILE, path.join(output, 'version.json'));
console.log(`\nReady in ${output}\n${sums.join('')}`);
