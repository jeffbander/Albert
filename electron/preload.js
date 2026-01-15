const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Dialogs
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // Platform info
  platform: process.platform,
  isElectron: true,

  // Panel events (from menu)
  onOpenPanel: (callback) => {
    window.addEventListener('albert-open-panel', (e) => callback(e.detail.type));
  },

  onOpenConfig: (callback) => {
    window.addEventListener('albert-open-config', () => callback());
  },

  onToggleVoice: (callback) => {
    window.addEventListener('albert-toggle-voice', () => callback());
  },
});

// Log that preload is working
console.log('Albert Electron preload script loaded');
