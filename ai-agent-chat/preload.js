const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  chatComplete: (p) => ipcRenderer.invoke('chat:complete', p),
  listModels: (p) => ipcRenderer.invoke('models:list', p),
  monkeyExec: (p) => ipcRenderer.invoke('monkey:exec', p),
  monkeyFs: (p) => ipcRenderer.invoke('monkey:fs', p),
  monkeyRoot: () => ipcRenderer.invoke('monkey:root'),
  adbExec: (p) => ipcRenderer.invoke('adb:exec', p),
  appInfo: () => ipcRenderer.invoke('app:info')
});