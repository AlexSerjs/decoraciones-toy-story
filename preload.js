// Puente seguro: las páginas solo pueden llamar a las operaciones de guardado que main.js permite.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ToyStory', {
  electron: true,
  call: (op, arg) => ipcRenderer.invoke('ts', op, arg),
  onProgress: cb => ipcRenderer.on('ts:progress', (_, d) => cb(d))
});
