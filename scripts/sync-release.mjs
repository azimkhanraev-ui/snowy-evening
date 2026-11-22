// npm run site:sync: fills version.json from the release that is really published on GitHub.
import { ARTIFACTS, repository } from './project.mjs';
import { writeVersionFile } from './version-file.mjs';

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'site-sync' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers });

if (response.status === 404) {
  console.log(`No published release in ${repository} yet, version.json is left as it is.`);
} else {
  if (!response.ok) throw new Error(`GitHub API answered ${response.status}`);
  const release = await response.json();

  const details = {};
  for (const [kind, name] of Object.entries(ARTIFACTS)) {
    const asset = release.assets.find((item) => item.name === name);
    if (!asset?.digest?.startsWith('sha256:')) throw new Error(`${name} or its SHA-256 is missing from the release`);
    details[kind] = { size: asset.size, sha256: asset.digest.slice('sha256:'.length) };
  }
  writeVersionFile({ version: release.tag_name.replace(/^v/, ''), published: true, date: release.published_at, details });
  console.log(`version.json now describes ${release.tag_name}`);
}
