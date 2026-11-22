// Where the project is published. CI passes the real values, locally package.json decides.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const repository =
  process.env.GITHUB_REPOSITORY || pkg.repository.url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/)[1];

const [owner, name] = repository.split('/');
const isUserSite = name.toLowerCase() === `${owner.toLowerCase()}.github.io`;

export const repoUrl = `https://github.com/${repository}`;
export const downloadBase = `${repoUrl}/releases/latest/download/`;
export const siteUrl = (
  process.env.SITE_URL || `https://${owner.toLowerCase()}.github.io${isUserSite ? '' : `/${name}`}`
).replace(/\/*$/, '/');

export const ARTIFACTS = { installer: 'SnowyEvening-Setup.exe', portable: 'SnowyEvening-Portable.exe' };
