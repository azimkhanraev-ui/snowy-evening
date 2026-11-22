// One switch for every animation on the page. Follows prefers-reduced-motion until the user chooses.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set();
let choice = null;

export function motionEnabled() {
  return choice ?? !reduced.matches;
}

export function onMotion(callback) {
  listeners.add(callback);
  callback();
}

function notify() {
  for (const callback of listeners) callback();
}

export function toggleMotion() {
  choice = !motionEnabled();
  notify();
}

reduced.addEventListener('change', notify);
