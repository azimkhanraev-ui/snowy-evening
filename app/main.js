import { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERIOD_IDS } from '../shared/engine/periods.js';
import { autostartEnabled, setAutostart } from './autostart.js';
import { ORIGIN, prepareOffline, serveLocalFiles } from './offline.js';
import { Scenes } from './scenes.js';
import { loadSettings, sanitize, saveSettings } from './settings-store.js';
import { stringsFor } from './strings.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PRELOAD = path.join(ROOT, 'app', 'preload.cjs');
const ICON = path.join(ROOT, 'app', 'assets', 'icon.ico');
const HOTKEY = 'Control+Alt+Shift+S';
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

let settings;
let scenes;
let tray;
let settingsWindow;
let saveTimer;

// A separate data folder is handy for testing without touching the real settings.
const customData = app.commandLine.getSwitchValue('user-data-dir');
if (customData) app.setPath('userData', path.resolve(customData));

prepareOffline();
app.setAppUserModelId('io.github.azimkhanraevui.snowyevening');

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const text = () => stringsFor(settings.language, app.getLocale());
// The portable build unpacks to a temporary folder, so autostart must point at the original file.
const executable = () => process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath;

function persist() {
  clearTimeout(saveTimer);
  try {
    saveSettings(settingsFile(), settings);
  } catch (error) {
    console.error('Could not save settings:', error);
  }
}

function update(changes) {
  settings = sanitize(changes, settings);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400); // sliders send many changes in a row
  scenes.settingsChanged();
  refreshControls();
}

function setPaused(paused) {
  scenes.setPaused(paused);
  refreshControls();
}

function settingsState() {
  return { settings, strings: text(), autostart: autostartEnabled(), version: app.getVersion() };
}

function refreshControls() {
  const t = text();
  const radio = (label, checked, changes) => ({ label, type: 'radio', checked, click: () => update(changes) });

  tray.setToolTip(t.appName);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: scenes.paused ? t.resume : t.pause, accelerator: HOTKEY, click: () => setPaused(!scenes.paused) },
      { type: 'separator' },
      radio(t.wallpaper, settings.mode === 'wallpaper', { mode: 'wallpaper' }),
      radio(t.overlay, settings.mode === 'overlay', { mode: 'overlay' }),
      { type: 'separator' },
      {
        label: t.timeOfDay,
        submenu: ['auto', ...PERIOD_IDS].map((id) => radio(t[id], settings.period === id, { period: id })),
      },
      { label: t.settings, click: openSettings },
      { type: 'separator' },
      { label: t.quit, click: () => app.quit() },
    ]),
  );

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setTitle(`${t.appName} — ${t.settings}`);
    settingsWindow.webContents.send('settings:state', settingsState());
  }
}

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 620,
    height: 760,
    minWidth: 420,
    minHeight: 420,
    title: `${text().appName} — ${text().settings}`,
    icon: ICON,
    backgroundColor: '#0d1535',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, spellcheck: false },
  });
  settingsWindow.removeMenu();
  settingsWindow.on('page-title-updated', (event) => event.preventDefault());
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  settingsWindow.loadURL(`${ORIGIN}/app/settings/index.html`);
}

function replaceBackground(name) {
  const previous = settings.background;
  update({ background: name });
  persist();
  if (previous && previous !== name) fs.rmSync(path.join(app.getPath('userData'), previous), { force: true });
}

async function chooseBackground() {
  const t = text();
  const { canceled, filePaths } = await dialog.showOpenDialog(settingsWindow, {
    properties: ['openFile'],
    filters: [{ name: t.images, extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (canceled) return;

  try {
    const source = filePaths[0];
    const extension = path.extname(source).toLowerCase();
    if (!/^\.(png|jpe?g|webp)$/.test(extension)) throw new Error('unsupported type');
    if ((await fs.promises.stat(source)).size > MAX_IMAGE_BYTES) throw new Error('too large');
    const name = `background-${Date.now()}${extension}`;
    await fs.promises.copyFile(source, path.join(app.getPath('userData'), name));
    replaceBackground(name);
  } catch {
    dialog.showErrorBox(t.appName, t.imageError);
  }
}

function changeAutostart(enabled) {
  try {
    setAutostart(enabled, executable());
  } catch {
    dialog.showErrorBox(text().appName, text().autostartError);
  }
  refreshControls();
}

function registerIpc() {
  const fromSettings = (handler) => (event, ...args) => {
    if (!settingsWindow || event.sender !== settingsWindow.webContents) return null;
    return handler(...args);
  };
  ipcMain.handle('scene:get', (event) => scenes.stateFor(event.sender.id));
  ipcMain.handle('settings:get', fromSettings(settingsState));
  ipcMain.handle('settings:update', fromSettings(update));
  ipcMain.handle('settings:autostart', fromSettings((enabled) => changeAutostart(enabled === true)));
  ipcMain.handle('settings:choose-background', fromSettings(chooseBackground));
  ipcMain.handle('settings:reset-background', fromSettings(() => replaceBackground(null)));
}

function start() {
  Menu.setApplicationMenu(null);
  fs.mkdirSync(app.getPath('userData'), { recursive: true });

  const loaded = loadSettings(settingsFile());
  settings = loaded.settings;
  serveLocalFiles(ROOT, () => settings.background && path.join(app.getPath('userData'), settings.background));

  scenes = new Scenes({
    preload: PRELOAD,
    getSettings: () => settings,
    onWallpaperFailed: () => {
      update({ mode: 'overlay' });
      tray.displayBalloon({ title: text().appName, content: text().wallpaperError });
    },
  });
  tray = new Tray(ICON);
  tray.on('click', openSettings);

  registerIpc();
  scenes.start();
  refreshControls();
  globalShortcut.register(HOTKEY, () => setPaused(!scenes.paused));

  if (loaded.firstRun) {
    persist();
    openSettings();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else if (process.argv.includes('--quit')) {
  app.quit(); // nothing was running
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--quit')) app.quit();
    else if (settings) openSettings();
  });
  app.on('window-all-closed', () => {}); // lives in the tray
  // before-quit, so the scene timer cannot rebuild windows that are being closed.
  app.on('before-quit', () => {
    if (!settings) return;
    persist();
    globalShortcut.unregisterAll();
    scenes?.dispose();
    tray?.destroy();
  });
  app.whenReady().then(start);
}
