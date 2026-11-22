const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (handler) => ipcRenderer.on(channel, (_event, state) => handler(state));

contextBridge.exposeInMainWorld('winter', {
  scene: {
    get: () => ipcRenderer.invoke('scene:get'),
    onChange: listen('scene:state'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (changes) => ipcRenderer.invoke('settings:update', changes),
    setAutostart: (enabled) => ipcRenderer.invoke('settings:autostart', enabled),
    chooseBackground: () => ipcRenderer.invoke('settings:choose-background'),
    resetBackground: () => ipcRenderer.invoke('settings:reset-background'),
    onChange: listen('settings:state'),
  },
});
