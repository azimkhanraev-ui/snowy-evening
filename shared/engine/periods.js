// Colours and lighting for each time of day. `tint` is mixed into every object by `shade`.
export const PERIODS = {
  dawn: {
    from: 5, sky: ['#26305f', '#8a6a9e', '#f3a6a0', '#ffd7b0'],
    far: '#8d87b5', mid: '#686b9c', forest: '#39446f', snow: ['#e3d6e8', '#a9a6cc'], road: '#62668a',
    tint: '#4a4f86', shade: 0.28, stars: 0.18, glow: 0.65,
    sun: { x: 0.56, y: 0.64, r: 30, color: '#ffe0b8' },
  },
  morning: {
    from: 8, sky: ['#5d96d3', '#93bee4', '#cfe3f2', '#fff0d9'],
    far: '#a9c0dc', mid: '#7fa0c4', forest: '#385f7c', snow: ['#fffaf2', '#bfd3e8'], road: '#7c8ca3',
    tint: '#8fb4da', shade: 0.08, stars: 0, glow: 0.12,
    sun: { x: 0.46, y: 0.4, r: 28, color: '#fff6d2' },
  },
  day: {
    from: 11, sky: ['#3479bd', '#6ba7d6', '#a9cde8', '#dcecf6'],
    far: '#9dbbd8', mid: '#6f97bf', forest: '#2d5874', snow: ['#ffffff', '#c3d9ed'], road: '#74879f',
    tint: '#ffffff', shade: 0, stars: 0, glow: 0,
    sun: { x: 0.62, y: 0.17, r: 26, color: '#fffbe6' },
  },
  sunset: {
    from: 16, sky: ['#33285e', '#8c4273', '#e3736b', '#ffc07a'],
    far: '#8a5f8c', mid: '#604873', forest: '#352e58', snow: ['#f2c9c5', '#9689b6'], road: '#5c5478',
    tint: '#533668', shade: 0.3, stars: 0.12, glow: 0.8,
    sun: { x: 0.52, y: 0.66, r: 36, color: '#ffd08a' },
  },
  evening: {
    from: 18, sky: ['#0d1535', '#1c2b5e', '#3b4583', '#7c679a'],
    far: '#3f4b82', mid: '#2c3868', forest: '#17224a', snow: ['#a9b7de', '#596c9f'], road: '#36436b',
    tint: '#17224f', shade: 0.43, stars: 0.65, glow: 1,
    moon: { x: 0.57, y: 0.2, r: 24 },
  },
  night: {
    from: 22, sky: ['#040818', '#09142f', '#12264c', '#1c3a5e'],
    far: '#1b2e55', mid: '#132344', forest: '#091732', snow: ['#7488b4', '#34487a'], road: '#22304f',
    tint: '#060e2a', shade: 0.56, stars: 1, glow: 1, aurora: true,
    moon: { x: 0.64, y: 0.15, r: 21 },
  },
};

export const PERIOD_IDS = Object.keys(PERIODS);

export function periodAt(date = new Date()) {
  const hour = date.getHours();
  // The hours before dawn belong to the night that started the previous evening.
  return PERIOD_IDS.findLast((id) => hour >= PERIODS[id].from) ?? 'night';
}
