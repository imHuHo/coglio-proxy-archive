/* Ponte tra la pagina e il processo principale: si espone solo il calcolo del bracket e la copia negli appunti.
   La richiesta parte da Electron (non dalla pagina), quindi non vale il blocco CORS del browser; gli appunti
   li scrive Electron perché la finestra può non avere il focus (ad esempio dopo aver aperto il browser). */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cpaNet', {
  bracket: (payload) => ipcRenderer.invoke('cpa:bracket', payload),
  copy: (text) => ipcRenderer.invoke('cpa:copy', text)
});
