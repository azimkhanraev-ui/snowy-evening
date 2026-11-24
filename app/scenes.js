// One scene window per monitor, either behind the icons or above every window.
// With snow on windows, the wallpaper also gets a light layer above the windows per monitor:
// the near flakes fall there and settle on the window edges.
import { BrowserWindow, powerMonitor, screen } from 'electron';
import { Worker } from 'node:worker_threads';
import * as win32 from './win32.js';
import { ORIGIN } from './offline.js';
import { sceneActivity } from './visibility.js';
import { iconsFor, pointerFor, windowsFor } from './desktop-map.js';

const CHECK_EVERY = 1500;
// Explorer may still be starting when we are launched with Windows.
const ATTACH_ATTEMPTS = 20;

export class Scenes {
  scenes = [];
  paused = false;
  away = false;
  failures = 0;
  icons = []; // desktop icons in physical screen pixels
  windows = []; // open windows in physical screen pixels, topmost first
  watcher = null;
  watching = null; // what the watcher reads: { icons, windows }
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
    const { mode, windowSnow } = this.getSettings();
    this.mode = mode;
    this.windowSnow = windowSnow;
    const displays = screen.getAllDisplays();
    this.scenes = displays.map((display) => this.create(display, mode === 'overlay' ? 'overlay' : 'wallpaper'));
    if (mode === 'wallpaper' && windowSnow) this.scenes.push(...displays.map((display) => this.create(display, 'front')));
  }

  /** `layer` is 'wallpaper', 'overlay', or 'front' (only the near snow, above the windows). */
  create(display, layer) {
    const overlay = layer !== 'wallpaper';
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
      title: layer === 'front' ? 'Snowy Evening snow' : 'Snowy Evening scene',
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
      area: screen.dipToScreenRect(null, bounds), // what the window covers, in physical pixels
      layer,
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
    if (scene.overlay) this.sendDesktop(scene, { windows: windowsFor(this.windows, scene) });
    else this.sendDesktop(scene, { icons: iconsFor(this.icons, scene) });
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
    const watch = { icons: false, windows: false };

    for (const scene of this.scenes) {
      if (!scene.ready) continue;
      const { visible, running } = sceneActivity({
        settings,
        layer: scene.layer,
        paused: this.paused, away: this.away, exclusive, window, monitor: scene.monitor, monitors,
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
      if (!running) continue;
      if (scene.overlay) watch.windows ||= settings.windowSnow;
      else watch.icons ||= settings.iconSnow;
    }
    this.watch(watch, settings);
  }

  /**
   * Starts or stops reading the desktop icons, the open windows and the mouse.
   * A pause keeps the snow where it lies, turning an option off clears it.
   */
  watch(wanted, settings) {
    if (!settings.iconSnow && this.icons.length) {
      this.icons = [];
      for (const scene of this.scenes) this.sendDesktop(scene, { icons: [] });
    }
    if (!settings.windowSnow && this.windows.length) {
      this.windows = [];
      for (const scene of this.scenes) this.sendDesktop(scene, { windows: [] });
    }
    const on = wanted.icons || wanted.windows;
    if (this.watching?.icons === wanted.icons && this.watching?.windows === wanted.windows) return;
    if (!on && !this.watching) return;
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
          this.watching = null;
        });
      } catch (error) {
        this.watcherBroken = true;
        console.error('Desktop watcher did not start:', error);
        return;
      }
    }
    this.watching = on ? { ...wanted } : null;
    this.watcher?.postMessage({ type: 'watch', value: wanted });
    for (const scene of this.scenes) {
      if (scene.pointer && !(scene.overlay ? wanted.windows : wanted.icons)) {
        scene.pointer = false;
        this.sendDesktop(scene, { pointer: null });
      }
    }
  }

  desktopMessage({ type, value }) {
    if (!this.watching) return;
    if (type === 'icons') {
      this.icons = value;
      for (const scene of this.scenes) if (!scene.overlay) this.sendDesktop(scene, { icons: iconsFor(value, scene) });
    } else if (type === 'windows') {
      this.windows = value;
      for (const scene of this.scenes) if (scene.overlay) this.sendDesktop(scene, { windows: windowsFor(value, scene) });
    } else if (type === 'pointer') {
      for (const scene of this.scenes) {
        // The wallpaper only cares about the mouse over the bare desktop.
        const wanted = scene.overlay ? this.watching.windows : this.watching.icons && value?.desktop;
        const pointer = wanted ? pointerFor(value, scene) : null;
        // Only the monitor under the mouse gets a stream of updates.
        if (pointer || scene.pointer) this.sendDesktop(scene, { pointer });
        scene.pointer = Boolean(pointer);
      }
    }
  }

  sendDesktop(scene, desktop) {
    if (!scene.ready || scene.window.isDestroyed()) return;
    scene.window.webContents.send('scene:desktop', desktop);
  }

  stateFor(webContentsId) {
    const scene = this.scenes.find((s) => s.id === webContentsId);
    if (!scene) return null;
    return { settings: this.getSettings(), running: scene.running, inset: scene.inset, overlay: scene.overlay, layer: scene.layer };
  }

  send(scene) {
    if (!scene.window.isDestroyed()) scene.window.webContents.send('scene:state', this.stateFor(scene.id));
  }

  settingsChanged() {
    const { mode, windowSnow } = this.getSettings();
    // The layer above the windows comes and goes with the option.
    if (mode !== this.mode || (mode === 'wallpaper' && windowSnow !== this.windowSnow)) return this.build();
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
