// One scene window per monitor, either behind the icons or above every window.
import { BrowserWindow, powerMonitor, screen } from 'electron';
import { Worker } from 'node:worker_threads';
import * as win32 from './win32.js';
import { ORIGIN } from './offline.js';
import { sceneActivity } from './visibility.js';
import { iconsFor, pointerFor } from './desktop-map.js';

const CHECK_EVERY = 1500;
// Explorer may still be starting when we are launched with Windows.
const ATTACH_ATTEMPTS = 20;

export class Scenes {
  scenes = [];
  paused = false;
  away = false;
  failures = 0;
  icons = []; // desktop icons in physical screen pixels
  watcher = null;
  watching = false;
  watcherBroken = false; // a failed watcher is not restarted every few seconds

  constructor({ preload, getSettings, onWallpaperFailed }) {
    Object.assign(this, { preload, getSettings, onWallpaperFailed });
  }

  start() {
    this.build();
    const rebuildSoon = () => {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = setTimeout(() => this.build(), 700);
    };
    screen.on('display-added', rebuildSoon);
    screen.on('display-removed', rebuildSoon);
    screen.on('display-metrics-changed', rebuildSoon);

    for (const event of ['lock-screen', 'suspend']) powerMonitor.on(event, () => this.setAway(true));
    for (const event of ['unlock-screen', 'resume']) powerMonitor.on(event, () => this.setAway(false));
    this.timer = setInterval(() => this.check(), CHECK_EVERY);
  }

  build() {
    this.clear();
    const { mode } = this.getSettings();
    this.mode = mode;
    this.scenes = screen.getAllDisplays().map((display) => this.create(display, mode));
  }

  create(display, mode) {
    const overlay = mode === 'overlay';
    const bounds = overlay ? display.workArea : display.bounds;
    const window = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      thickFrame: false,
      transparent: overlay,
      backgroundColor: overlay ? '#00000000' : '#0d1535',
      hasShadow: false,
      roundedCorners: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      title: 'Snowy Evening scene',
      webPreferences: {
        preload: this.preload,
        sandbox: true,
        contextIsolation: true,
        spellcheck: false,
        backgroundThrottling: false, // we decide ourselves when to pause
      },
    });

    const scene = {
      window,
      id: window.webContents.id,
      monitor: screen.dipToScreenRect(null, display.bounds),
      scale: display.scaleFactor,
      pointer: false,
      // The taskbar hides the bottom of the wallpaper.
      inset: overlay ? 0 : Math.max(0, display.bounds.y + display.bounds.height - display.workArea.y - display.workArea.height),
      overlay,
      running: true,
      ready: false,
      parent: 0,
    };
    if (overlay) window.setIgnoreMouseEvents(true);

    window.webContents.once('did-finish-load', () => this.place(scene));
    window.loadURL(`${ORIGIN}/app/scene/index.html`);
    return scene;
  }

  place(scene) {
    const { window, overlay, monitor } = scene;
    if (window.isDestroyed() || !this.scenes.includes(scene)) return;

    if (overlay) {
      window.setAlwaysOnTop(true, 'screen-saver');
    } else {
      const hwnd = win32.handleOf(window);
      scene.parent = win32.attachToDesktop(hwnd, monitor);
      if (!scene.parent) return this.attachFailed();
      window.showInactive();
      // Electron re-applies its own bounds when shown, so position the child again.
      win32.attachToDesktop(hwnd, monitor);
      this.failures = 0;
    }
    scene.ready = true;
    this.sendDesktop(scene, { icons: iconsFor(this.icons, scene) });
    this.check();
  }

  attachFailed() {
    this.clear();
    if (++this.failures >= ATTACH_ATTEMPTS) {
      this.failures = 0;
      this.onWallpaperFailed();
    }
    // Otherwise check() rebuilds on its next tick.
  }

  check() {
    const lost = this.scenes.some(
      (s) => s.window.isDestroyed() || (s.ready && !s.overlay && !win32.isWindow(s.parent)),
    );
    if (lost || !this.scenes.length) return this.build(); // Explorer restarted

    const settings = this.getSettings();
    const window = win32.foregroundWindow();
    const exclusive = win32.exclusiveFullscreen();
    const monitors = this.scenes.map((s) => s.monitor);
    let watch = false;

    for (const scene of this.scenes) {
      if (!scene.ready) continue;
      const { visible, running } = sceneActivity({
        settings, paused: this.paused, away: this.away, exclusive, window, monitor: scene.monitor, monitors,
      });
      if (scene.overlay && visible !== scene.window.isVisible()) {
        if (visible) {
          scene.window.showInactive();
          scene.window.setAlwaysOnTop(true, 'screen-saver');
        } else {
          scene.window.hide();
        }
      }
      if (running !== scene.running) {
        scene.running = running;
        this.send(scene);
      }
      watch ||= running && !scene.overlay && settings.iconSnow;
    }
    this.watch(watch, settings.iconSnow);
  }

  /**
   * Starts or stops reading the desktop icons and the mouse.
   * A pause keeps the snow on the icons, turning the option off clears it.
   */
  watch(on, keep) {
    if (!keep && this.icons.length) {
      this.icons = [];
      for (const scene of this.scenes) this.sendDesktop(scene, { icons: [] });
    }
    if (on === this.watching) return;
    this.watching = on;
    if (on && !this.watcher) {
      if (this.watcherBroken) return;
      try {
        this.watcher = new Worker(new URL('./desktop-watch.js', import.meta.url));
        this.watcher.on('message', (message) => this.desktopMessage(message));
        this.watcher.on('error', (error) => {
          this.watcherBroken = true;
          console.error('Desktop watcher failed:', error);
        });
        this.watcher.on('exit', () => {
          this.watcher = null;
          this.watching = false;
        });
      } catch (error) {
        this.watcherBroken = true;
        console.error('Desktop watcher did not start:', error);
        return;
      }
    }
    this.watcher?.postMessage({ type: 'active', value: on });
    if (!on) {
      for (const scene of this.scenes) this.sendDesktop(scene, { pointer: null });
    }
  }

  desktopMessage({ type, value }) {
    if (!this.watching) return;
    if (type === 'icons') {
      this.icons = value;
      for (const scene of this.scenes) this.sendDesktop(scene, { icons: iconsFor(value, scene) });
    } else if (type === 'pointer') {
      for (const scene of this.scenes) {
        const pointer = pointerFor(value, scene);
        // Only the monitor under the mouse gets a stream of updates.
        if (pointer || scene.pointer) this.sendDesktop(scene, { pointer });
        scene.pointer = Boolean(pointer);
      }
    }
  }

  sendDesktop(scene, desktop) {
    if (scene.overlay || !scene.ready || scene.window.isDestroyed()) return;
    scene.window.webContents.send('scene:desktop', desktop);
  }

  stateFor(webContentsId) {
    const scene = this.scenes.find((s) => s.id === webContentsId);
    if (!scene) return null;
    return { settings: this.getSettings(), running: scene.running, inset: scene.inset, overlay: scene.overlay };
  }

  send(scene) {
    if (!scene.window.isDestroyed()) scene.window.webContents.send('scene:state', this.stateFor(scene.id));
  }

  settingsChanged() {
    if (this.getSettings().mode !== this.mode) return this.build();
    for (const scene of this.scenes) this.send(scene);
    this.check();
  }

  setPaused(paused) {
    this.paused = paused;
    this.check();
  }

  setAway(away) {
    this.away = away;
    this.check();
  }

  clear() {
    const old = this.scenes;
    this.scenes = [];
    for (const { window } of old) {
      if (!window.isDestroyed()) window.destroy();
    }
    for (const parent of new Set(old.map((s) => s.parent).filter(Boolean))) win32.repaintDesktop(parent);
  }

  dispose() {
    clearInterval(this.timer);
    this.watcher?.terminate();
    this.watcher = null;
    clearTimeout(this.rebuildTimer);
    this.clear();
  }
}
