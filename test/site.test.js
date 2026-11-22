import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import en from '../website/src/en.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('every phrase on the site has an English translation', () => {
  const html = read('website/index.html') + read('website/privacy.html');
  const keys = [
    ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]),
    ...[...html.matchAll(/data-i18n-attr="[^":]+:([^"]+)"/g)].map((match) => match[1]),
    ...[...read('website/src/i18n.js').matchAll(/^ {2}'([\w.]+)':/gm)].map((match) => match[1]),
  ];
  assert.deepEqual([...new Set(keys)].filter((key) => !en[key]), []);
});

test('version.json has stable links and is complete once published', () => {
  const release = JSON.parse(read('website/public/version.json'));
  for (const file of Object.values(release.files)) {
    assert.ok(file.url.endsWith(`/releases/latest/download/${file.name}`));
    if (!release.published) continue;
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.size > 0);
  }
});

test('the changelog starts with the current version', () => {
  assert.equal(JSON.parse(read('website/src/changelog.json'))[0].version, JSON.parse(read('package.json')).version);
});
