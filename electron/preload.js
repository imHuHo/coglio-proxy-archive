/* Ponte tra la pagina e il processo principale: l'unica cosa esposta è il calcolo del bracket.
   La richiesta parte da Electron (non dalla pagina), quindi non vale il blocco CORS del browser. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cpaNet', {
  bracket: (payload) => ipcRenderer.invoke('cpa:bracket', payload)
});
