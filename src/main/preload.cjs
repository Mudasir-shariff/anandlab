const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('labflowAPI', {
  getSupabaseConfig: () => ipcRenderer.invoke('get-supabase-config'),
  saveSupabaseConfig: (cfg) => ipcRenderer.invoke('save-supabase-config', cfg),
  saveSession: (sessionStr) => ipcRenderer.invoke('auth:save-session', sessionStr),
  loadSession: () => ipcRenderer.invoke('auth:load-session'),
  clearSession: () => ipcRenderer.invoke('auth:clear-session'),
  getPrinters: () => ipcRenderer.invoke('print:get-printers'),
  printReceipt: (options) => ipcRenderer.invoke('print:receipt', options),
  printReport: (options) => ipcRenderer.invoke('print:report', options),
  printToPDF: (options) => ipcRenderer.invoke('print:to-pdf', options),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
});
