import fs from 'node:fs';
import { PERIOD_IDS } from '../shared/engine/periods.js';

export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'wallpaper',
  period: 'auto',
  snow: 45,
  wind: 15,
  fps: 30,
  plow: true,
  iconSnow: true,
  windowSnow: true,
  house: true,
  lights: true,
  pauseInGames: true,
  pauseWhenCovered: true,
  language: 'auto',
  background: null,
});

const oneOf = (...allowed) => (value) => allowed.includes(value);
const within = (min, max) => (value) => Number.isFinite(value) && value >= min && value <= max;
const flag = (value) => typeof value === 'boolean';

const RULES = {
  mode: oneOf('wallpaper', 'overlay'),
  period: oneOf('auto', ...PERIOD_IDS),
  snow: within(0, 100),
  wind: within(-100, 100),
  fps: oneOf(15, 30, 60),
  plow: flag,
  iconSnow: flag,
  windowSnow: flag,
  house: flag,
  lights: flag,
  pauseInGames: flag,
  pauseWhenCovered: flag,
  language: oneOf('auto', 'ru', 'en'),
  // A file name inside the data folder, never a path.
  background: (value) => value === null || (typeof value === 'string' && /^background-\d+\.(png|jpe?g|webp)$/.test(value)),
};

/** Returns a complete settings object, dropping anything unknown or invalid. */
export function sanitize(input, base = DEFAULT_SETTINGS) {
  const result = { ...base };
  if (!input || typeof input !== 'object') return result;
  for (const [key, valid] of Object.entries(RULES)) {
    if (Object.hasOwn(input, key) && valid(input[key])) result[key] = input[key];
  }
  return result;
}

export function loadSettings(file) {
  try {
    return { settings: sanitize(JSON.parse(fs.readFileSync(file, 'utf8'))), firstRun: false };
  } catch (error) {
    // A damaged file falls back to the defaults, a missing one also means first launch.
    return { settings: { ...DEFAULT_SETTINGS }, firstRun: error.code === 'ENOENT' };
  }
}

export function saveSettings(file, settings) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(settings, null, 2));
  fs.renameSync(temporary, file);
}
