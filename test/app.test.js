import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { autostartArguments } from '../app/autostart.js';
import { DEFAULT_SETTINGS, loadSettings, sanitize, saveSettings } from '../app/settings-store.js';
import { stringsFor } from '../app/strings.js';
import { sceneActivity } from '../app/visibility.js';
import { periodAt } from '../shared/engine/periods.js';

test('each hour maps to its period', () => {
  const cases = { 0: 'night', 4: 'night', 5: 'dawn', 7: 'dawn', 8: 'morning', 11: 'day', 15: 'day', 16: 'sunset', 18: 'evening', 21: 'evening', 22: 'night' };
  for (const [hour, id] of Object.entries(cases)) assert.equal(periodAt(new Date(2026, 0, 1, hour)), id, `${hour}:00`);
});

test('invalid settings are ignored', () => {
  const hostile = { snow: 900, wind: NaN, fps: 1000, mode: 'x', plow: 'yes', background: '..\\..\\secret.png', extra: 1 };
  assert.deepEqual(sanitize(hostile), { ...DEFAULT_SETTINGS });
  assert.deepEqual(sanitize(null), { ...DEFAULT_SETTINGS });
  assert.equal(sanitize({ background: 'background-123.jpg' }).background, 'background-123.jpg');
});

test('settings survive a save, a damaged file falls back to defaults', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'snowy-test-'));
  try {
    const file = path.join(folder, 'settings.json');
    assert.equal(loadSettings(file).firstRun, true);
    saveSettings(file, { ...DEFAULT_SETTINGS, snow: 80 });
    assert.equal(loadSettings(file).settings.snow, 80);
    fs.writeFileSync(file, '{broken');
    assert.deepEqual(loadSettings(file), { settings: { ...DEFAULT_SETTINGS }, firstRun: false });
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

const left = { x: 0, y: 0, width: 1920, height: 1080 };
const right = { x: 1920, y: 0, width: 1920, height: 1080 };
const game = { left: 0, top: 0, right: 1920, bottom: 1080, maximized: false, captioned: false };
const maximized = { left: -8, top: -8, right: 1928, bottom: 1088, maximized: true, captioned: true };
const overlay = { ...DEFAULT_SETTINGS, mode: 'overlay' };
const activity = (changes) =>
  sceneActivity({ settings: DEFAULT_SETTINGS, window: null, monitor: left, monitors: [left, right], ...changes });

test('a game stops the wallpaper and hides the overlay on every monitor', () => {
  assert.deepEqual(activity({ window: game, monitor: right }), { visible: true, running: false });
  assert.deepEqual(activity({ settings: overlay, window: game, monitor: right }), { visible: false, running: false });
  assert.deepEqual(activity({ settings: overlay, exclusive: true }), { visible: false, running: false });
});

test('a maximized window stops only the wallpaper beneath it', () => {
  assert.equal(activity({ window: maximized }).running, false);
  assert.equal(activity({ window: maximized, monitor: right }).running, true);
  assert.deepEqual(activity({ settings: overlay, window: maximized }), { visible: true, running: true });
});

test('pause and lock screen stop the scene, the options disable automatic pause', () => {
  assert.equal(activity({ paused: true }).running, false);
  assert.equal(activity({ away: true }).running, false);
  const settings = { ...DEFAULT_SETTINGS, pauseInGames: false, pauseWhenCovered: false };
  assert.equal(activity({ settings, window: game }).running, true);
  assert.equal(activity({ settings, window: maximized }).running, true);
});

test('both app languages have the same phrases', () => {
  assert.deepEqual(Object.keys(stringsFor('ru')).sort(), Object.keys(stringsFor('en')).sort());
});

test('autostart quotes paths with spaces and touches only its own value', () => {
  const add = autostartArguments(true, 'C:\\My Apps\\Snowy Evening.exe');
  assert.equal(add[1], 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run');
  assert.equal(add[add.indexOf('/d') + 1], '"C:\\My Apps\\Snowy Evening.exe" --autostart');
  for (const args of [add, autostartArguments(false)]) assert.equal(args[args.indexOf('/v') + 1], 'SnowyEvening');
});

test('the snow above the windows rests with the wallpaper under a maximized window, hides in games', () => {
  const front = (changes) => activity({ layer: 'front', ...changes });
  assert.deepEqual(front({}), { visible: true, running: true });
  assert.deepEqual(front({ window: maximized }), { visible: false, running: false });
  assert.deepEqual(front({ window: maximized, monitor: right }), { visible: true, running: true });
  assert.deepEqual(front({ window: game, monitor: right }), { visible: false, running: false });
  assert.deepEqual(front({ paused: true }), { visible: false, running: false });
  assert.deepEqual(front({ window: maximized, settings: { ...DEFAULT_SETTINGS, pauseWhenCovered: false } }), { visible: true, running: true });
});
