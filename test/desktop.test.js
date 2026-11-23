import assert from 'node:assert/strict';
import test from 'node:test';
import { iconsFor, pointerFor } from '../app/desktop-map.js';
import { DesktopSnow, segmentHitsBox } from '../shared/engine/desktop.js';
import { SnowCover } from '../shared/engine/snow.js';

const FLOOR = 700;

function world(changes = {}) {
  const landed = [];
  return {
    landed,
    w: 1536,
    h: 864,
    amount: 100,
    groundAt: () => FLOOR,
    addToGround: (x, size) => landed.push({ x, size }),
    takeFromGround: () => 0,
    ...changes,
  };
}

function run(snow, w, seconds, step = 1 / 30) {
  for (let t = 0; t < seconds; t += step) snow.update(step, w);
}

const ICON = { x: 100, y: 100, size: 57 };
const OTHER = { x: 100, y: 400, size: 57 };
const pointer = (x, y, primary = false, middle = false) => ({ x, y, primary, middle });

test('icon snow is mapped onto the right monitor in its own pixels', () => {
  const left = { monitor: { x: 0, y: 0, width: 1920, height: 1080 }, scale: 1.25 };
  const right = { monitor: { x: 1920, y: 0, width: 2560, height: 1440 }, scale: 1 };
  const icons = [{ x: 12, y: 7, size: 71 }, { x: 2000, y: 10, size: 48 }];
  assert.deepEqual(iconsFor(icons, left), [{ x: 9.6, y: 5.6, size: 56.8 }]);
  assert.deepEqual(iconsFor(icons, right), [{ x: 80, y: 10, size: 48 }]);
  assert.deepEqual(pointerFor({ x: 125, y: 250, primary: true, middle: false }, left), { x: 100, y: 200, primary: true, middle: false });
  assert.equal(pointerFor({ x: 125, y: 250, primary: true, middle: false }, right), null);
  assert.equal(pointerFor(null, left), null);
});

test('snow piles up on icons only while it snows, up to a limit', () => {
  const snow = new DesktopSnow();
  snow.setIcons([ICON]);
  const start = snow.caps[0].h;
  assert.ok(start > 0, 'a fresh start already shows some snow');

  run(snow, world({ amount: 0 }), 5);
  assert.equal(snow.caps[0].h, start);
  run(snow, world(), 300);
  assert.equal(snow.caps[0].h, ICON.size * 0.3);
});

test('a dragged icon drops its snow, which lands on the ground', () => {
  const snow = new DesktopSnow();
  snow.setIcons([ICON]);
  snow.setIcons([{ ...ICON, x: 600 }]);
  assert.equal(snow.caps[0].h, 0);
  assert.ok(snow.chunks.length > 0);

  const w = world();
  run(snow, w, 3);
  assert.equal(snow.chunks.length, 0);
  assert.ok(w.landed.length > 0 && w.landed.every(({ x }) => x > 0 && x < 300), 'it falls where the icon stood');
});

test('a quick click or a fast swipe knocks the snow off', () => {
  const snow = new DesktopSnow();
  const w = world();
  snow.setIcons([ICON, OTHER]);
  run(snow, w, 0.1);

  snow.setPointer(pointer(128, 95, true));
  run(snow, w, 0.1);
  snow.setPointer(pointer(128, 95));
  assert.equal(snow.caps[0].h, 0, 'click above the icon');

  snow.setPointer(pointer(20, 395));
  run(snow, w, 1 / 30);
  snow.setPointer(pointer(250, 395));
  assert.equal(snow.caps[1].h, 0, 'swipe through the cap');

  snow.setIcons([ICON, OTHER]);
  run(snow, w, 60);
  snow.setPointer(pointer(20, 395));
  run(snow, w, 0.5);
  snow.setPointer(pointer(25, 395));
  assert.ok(snow.caps[1].h > 0, 'slow movement leaves it alone');
});

test('holding the button on snow makes a snowball that can hit another icon', () => {
  const snow = new DesktopSnow();
  const w = world();
  snow.setIcons([ICON, OTHER]);
  run(snow, w, 120); // full caps

  snow.setPointer(pointer(128, 92, true));
  run(snow, w, 1.5);
  assert.ok(snow.ball?.held, 'the ball forms while the button is held');
  assert.ok(snow.ball.r > 5);
  assert.ok(snow.caps[0].h < ICON.size * 0.3, 'it is made from the snow on the icon');

  // Fling it straight down onto the icon below.
  for (let y = 100; y <= 220; y += 30) {
    snow.setPointer(pointer(128, y, true));
    run(snow, w, 1 / 30);
  }
  const before = snow.caps[1].h;
  snow.setPointer(pointer(128, 250));
  assert.equal(snow.ball.held, false);
  assert.ok(snow.ball.vy > 500);
  run(snow, w, 0.5);
  assert.equal(snow.ball, null);
  assert.ok(before > 10 && snow.caps[1].h < 1, 'the hit icon loses its snow (new flakes may already settle)');
});

test('a snowball needs snow, and dragging to select icons makes none', () => {
  const snow = new DesktopSnow();
  const w = world();
  snow.setIcons([ICON]);
  run(snow, w, 0.1);

  snow.setPointer(pointer(700, 300, true)); // empty desktop, far from the ground
  run(snow, w, 1);
  assert.equal(snow.ball, null);
  snow.setPointer(pointer(700, 300));

  snow.setPointer(pointer(128, 92, true));
  snow.setPointer(pointer(160, 150, true)); // starts a selection rectangle at once
  run(snow, w, 1);
  assert.equal(snow.ball, null);
  snow.setPointer(pointer(160, 150));

  snow.setPointer(pointer(300, 695, false, true)); // on the ground; the middle button needs no waiting
  run(snow, w, 1 / 30);
  assert.ok(snow.ball);
});

test('road snow grows until the plow is needed, and can be scooped', () => {
  const cover = new SnowCover();
  cover.resize(1000, 1);
  const start = cover.depth();
  assert.ok(start > 5 && start < 10);
  for (let t = 0; t < 60; t++) cover.update(1, 1, 0);
  assert.equal(cover.depth(), start, 'no snowfall, no growth');
  for (let t = 0; t < 600; t++) cover.update(1, 1, 45);
  assert.ok(cover.depth() > 16, 'at the default snow amount the plow is called within ten minutes');

  const before = cover.heightAt(500);
  assert.ok(cover.take(500, 4) > 0);
  assert.ok(cover.heightAt(500) < before);
  cover.add(200, 30);
  assert.ok(cover.heightAt(200) <= 30, 'never above the limit');
});

test('segments are tested against boxes', () => {
  assert.equal(segmentHitsBox({ x: 0, y: 5 }, { x: 20, y: 5 }, 8, 0, 12, 10), true);
  assert.equal(segmentHitsBox({ x: 0, y: 15 }, { x: 20, y: 15 }, 8, 0, 12, 10), false);
  assert.equal(segmentHitsBox({ x: 10, y: -5 }, { x: 10, y: 20 }, 8, 0, 12, 10), true);
});
