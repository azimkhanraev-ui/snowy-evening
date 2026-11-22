// Autostart is one value in the current user's Run key. The uninstaller removes it,
// see build/installer.nsh. reg.exe needs no extra native code and lets us quote paths exactly.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE = 'SnowyEvening';
const REG = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe');

const reg = (args) => execFileSync(REG, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });

/** The reg.exe arguments, separate so tests can check them without touching the registry. */
export function autostartArguments(enabled, executable) {
  return enabled
    ? ['add', RUN_KEY, '/v', VALUE, '/t', 'REG_SZ', '/d', `"${executable}" --autostart`, '/f']
    : ['delete', RUN_KEY, '/v', VALUE, '/f'];
}

export function autostartEnabled() {
  try {
    reg(['query', RUN_KEY, '/v', VALUE]);
    return true;
  } catch {
    return false; // reg.exe exits with 1 when the value does not exist
  }
}

export function setAutostart(enabled, executable) {
  if (!enabled && !autostartEnabled()) return;
  reg(autostartArguments(enabled, executable));
}
