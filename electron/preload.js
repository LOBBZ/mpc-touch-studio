// Brug tussen de app (web) en Windows/macOS: de meegeleverde VMPC2000XL starten.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mpcNative', {
  platform: process.platform,
  vmpcInfo: () => ipcRenderer.invoke('vmpc-info'),
  launchVmpc: () => ipcRenderer.invoke('vmpc-launch'),
  openVmpcFolder: (which) => ipcRenderer.invoke('vmpc-folder', which)
});
