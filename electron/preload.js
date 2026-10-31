/* Ponte tra la pagina e il processo principale: si espone solo il calcolo del bracket, la copia negli appunti e lo scarico degli aggiornamenti.
   La richiesta parte da Electron (non dalla pagina), quindi non vale il blocco CORS del browser; gli appunti
   li scrive Electron perché la finestra può non avere il focus (ad esempio dopo aver aperto il browser). */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cpaNet', {
  bracket: (payload) => ipcRenderer.invoke('cpa:bracket', payload),
  copy: (text) => ipcRenderer.invoke('cpa:copy', text),
  image: (url) => ipcRenderer.invoke('cpa:image', url),
  quit: () => ipcRenderer.invoke('cpa:quit'),
  resource: (name) => ipcRenderer.invoke('cpa:resource', name),
  update: (url) => ipcRenderer.invoke('cpa:update', url),
  onUpdateProgress: (cb) => { ipcRenderer.removeAllListeners('cpa:update-progress'); ipcRenderer.on('cpa:update-progress', (_e, p) => cb(p)); }
});
