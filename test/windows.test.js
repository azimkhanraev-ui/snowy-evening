import assert from 'node:assert/strict';
import test from 'node:test';
import { pointerFor, windowsFor } from '../app/desktop-map.js';
import { Snowfall } from '../shared/engine/snow.js';
import { WindowSnow } from '../shared/engine/windows.js';

const world = { amount: 100, h: 1000 };
const run = (snow, seconds, step = 1 / 30) => {
  for (let t = 0; t < seconds; t += step) snow.update(step, world);
};
const deepest = (win) => Math.max(...win.heights);
const A = { id: 1, x: 100, y: 200, w: 400, h: 300, cap: true };
const B = { id: 2, x: 300, y: 100, w: 400, h: 300, cap: true }; // above A, covers A's right half

test('windows are mapped into the layer above them, which starts below the screen top', () => {
  const scene = { monitor: { x: 0, y: 0, width: 1920, height: 1080 }, area: { x: 0, y: 0, width: 1920, height: 1032 }, scale: 1.25 };
  const list = [{ id: 7, x: 125, y: 250, w: 500, h: 400, cap: true }, { id: 8, x: 2500, y: 0, w: 300, h: 300, cap: true }];
  assert.deepEqual(windowsFor(list, scene), [{ id: 7, x: 100, y: 200, w: 400, h: 320, cap: true }]);
  assert.equal(pointerFor({ x: 10, y: 1040 }, scene), null, 'the taskbar is not in the layer');
  assert.deepEqual(windowsFor(list, { ...scene, area: { x: 1920, y: 0, width: 1920, height: 1032 }, scale: 1 })[0].x, 580);
});

test('snow builds up only where a window is open to the sky', () => {
  const snow = new WindowSnow();
  snow.setWindows([B, A]);
  const a = snow.windows[1];
  const covered = Math.round((400 - A.x) / 4);
  assert.equal(a.open[covered], 0, 'under window B');
  assert.equal(a.open[10], 1);
  const before = a.heights[covered];
  run(snow, 200);
  assert.equal(a.heights[covered], before, 'no new snow under B');
  assert.equal(a.heights[20], a.limits[20], 'full on the open part');
  assert.ok(a.heights[0] < a.heights[30] && a.heights[0] < a.heights[20], 'thinner at the corner');
});

test('a flake lands on the first open surface below it', () => {
  const snow = new WindowSnow();
  snow.setWindows([B, A]);
  const b = snow.windows[0];
  const c = Math.round((500 - B.x) / 4);
  const top = B.y - b.heights[c];
  assert.equal(snow.land(500, top - 5, top + 5), true);
  assert.ok(b.heights[c] > B.y - top);
  assert.equal(snow.land(150, 150, 160), false, 'still in the air');
  const ac = Math.round((150 - A.x) / 4);
  assert.equal(snow.land(150, A.y - snow.windows[1].heights[ac] - 3, A.y + 2), true, 'on A where B does not cover it');
});

test('moving, maximizing or closing a window drops its snow', () => {
  const snow = new WindowSnow();
  snow.setWindows([A]);
  run(snow, 60);
  assert.ok(deepest(snow.windows[0]) > 5);
  snow.setWindows([{ ...A, x: 160 }]);
  assert.equal(deepest(snow.windows[0]), 0);
  assert.ok(snow.chunks.length > 10);

  run(snow, 60);
  snow.setWindows([{ ...A, x: 160, cap: false }]);
  assert.equal(deepest(snow.windows[0]), 0, 'maximized');
  run(snow, 10);
  assert.equal(deepest(snow.windows[0]), 0, 'a maximized window keeps no snow');

  snow.setWindows([{ ...A, x: 160 }]);
  run(snow, 60);
  const chunks = snow.chunks.length;
  snow.setWindows([]);
  assert.ok(snow.chunks.length > chunks, 'a closed window drops its snow');
  run(snow, 3);
  assert.equal(snow.chunks.length, 0, 'the chunks fall off the screen');
});

test('the same window in the same place keeps its snow, a fast swipe knocks part of it off', () => {
  const snow = new WindowSnow();
  snow.setWindows([A]);
  run(snow, 120);
  snow.setWindows([{ ...A }]);
  assert.ok(deepest(snow.windows[0]) > 10);

  const win = snow.windows[0];
  snow.setPointer({ x: 150, y: 180 });
  run(snow, 1 / 30);
  snow.setPointer({ x: 250, y: 195 });
  assert.equal(win.heights[Math.round((200 - A.x) / 4)], 0, 'along the swipe');
  assert.ok(win.heights[Math.round((450 - A.x) / 4)] > 4, 'the rest stays');

  snow.setPointer(null); // the mouse left and came back
  snow.setPointer({ x: 450, y: 190 });
  run(snow, 0.5);
  snow.setPointer({ x: 455, y: 190 });
  assert.ok(win.heights[Math.round((450 - A.x) / 4)] > 4, 'a slow move leaves it');
});

test('chunks knocked off a window settle on the window below', () => {
  const snow = new WindowSnow();
  const lower = { id: 3, x: 100, y: 600, w: 400, h: 200, cap: true };
  snow.setWindows([A, lower]);
  snow.windows[1].heights.fill(0);
  run(snow, 120);
  snow.windows[1].heights.fill(0);
  snow.setWindows([{ ...A, x: 130 }, lower]);
  const amount = () => snow.windows[1].heights.reduce((sum, h) => sum + h, 0);
  const before = amount();
  run(snow, 2);
  assert.ok(amount() > before + 20);
});

test('far and near flakes split the snowfall between the two layers', () => {
  const view = { w: 1920, h: 1080, u: 1.5 };
  const count = (layer) => {
    const fall = new Snowfall(layer);
    fall.update(0, 0, view, 100, 0);
    return fall;
  };
  const all = count('all');
  const far = count('far');
  const near = count('near');
  assert.ok(Math.abs(far.flakes.length + near.flakes.length - all.flakes.length) <= 2);
  assert.ok(far.flakes.every((f) => f.z <= 0.5) && near.flakes.every((f) => f.z >= 0.5));
  assert.ok(near.flakes.some((f) => f.kind === 'bokeh') && far.flakes.every((f) => f.kind !== 'bokeh'));

  // Near flakes fall faster than far ones.
  const speed = (fall) => fall.flakes.reduce((sum, f) => sum + f.fall, 0) / fall.flakes.length;
  assert.ok(speed(near) > speed(far) * 1.8);

  // A flake caught by a surface starts again at the top.
  for (const f of near.flakes) f.y = 500;
  near.update(0.05, 1, view, 100, 0, () => true);
  assert.ok(near.flakes.every((f) => f.y < 0));
});
