const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// 1. Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// 2. Load .env config in development / local run
function loadEnv() {
  const envPath = path.join(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

let mainWindow = null;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'Opti-X Labs - Diagnostics & Reports',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  // Strict Content-Security-Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob:;"
        ]
      }
    });
  });

  // Block external navigation & popup windows
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // Disable DevTools in production
  if (!isDev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Second instance focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 3. Secure IPC Handlers
function setupIPC() {
  const sessionPath = path.join(app.getPath('userData'), 'session.enc');

  // Supabase Public Config (URL & Publishable / Anon Key ONLY)
  ipcMain.handle('get-supabase-config', () => {
    return {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
    };
  });

  ipcMain.handle('save-supabase-config', async (event, { supabaseUrl, supabaseAnonKey }) => {
    try {
      const envPath = path.join(__dirname, '../../.env');
      let content = '';
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf8');
      }
      let lines = content ? content.split(/\r?\n/) : [];
      let urlFound = false, keyFound = false;
      lines = lines.map(line => {
        if (line.startsWith('SUPABASE_URL=')) { urlFound = true; return `SUPABASE_URL=${supabaseUrl}`; }
        if (line.startsWith('SUPABASE_PUBLISHABLE_KEY=')) { keyFound = true; return `SUPABASE_PUBLISHABLE_KEY=${supabaseAnonKey}`; }
        if (line.startsWith('SUPABASE_ANON_KEY=')) { keyFound = true; return `SUPABASE_ANON_KEY=${supabaseAnonKey}`; }
        return line;
      });
      if (!urlFound) lines.push(`SUPABASE_URL=${supabaseUrl}`);
      if (!keyFound) lines.push(`SUPABASE_PUBLISHABLE_KEY=${supabaseAnonKey}`);
      fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
      process.env.SUPABASE_URL = supabaseUrl;
      process.env.SUPABASE_PUBLISHABLE_KEY = supabaseAnonKey;
      process.env.SUPABASE_ANON_KEY = supabaseAnonKey;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Encrypted Session Persistence (Electron safeStorage)
  ipcMain.handle('auth:save-session', async (event, sessionDataString) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('safeStorage is not available on this platform. Fallback to basic storage.');
        fs.writeFileSync(sessionPath, Buffer.from(sessionDataString).toString('base64'), 'utf8');
        return { success: true };
      }
      const encrypted = safeStorage.encryptString(sessionDataString);
      fs.writeFileSync(sessionPath, encrypted);
      return { success: true };
    } catch (err) {
      console.error('Failed to save session securely:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth:load-session', async () => {
    try {
      if (!fs.existsSync(sessionPath)) return null;
      const buffer = fs.readFileSync(sessionPath);
      if (!safeStorage.isEncryptionAvailable()) {
        return Buffer.from(buffer.toString('utf8'), 'base64').toString('utf8');
      }
      return safeStorage.decryptString(buffer);
    } catch (err) {
      console.warn('Could not decrypt session, user will need to re-login:', err.message);
      return null;
    }
  });

  ipcMain.handle('auth:clear-session', async () => {
    try {
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Printer List
  ipcMain.handle('print:get-printers', async () => {
    if (!mainWindow) return [];
    return await mainWindow.webContents.getPrintersAsync();
  });

  // Print Receipt (supports 80mm thermal and A4)
  ipcMain.handle('print:receipt', async (event, { html, format = 'thermal', printerName = '' }) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false
      }
    });

    try {
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      const printOptions = {
        silent: true,
        deviceName: printerName || undefined
      };

      if (format === 'thermal') {
        // 80mm roll width: approx 72mm printable (~283 points)
        printOptions.margins = { marginType: 'none' };
        printOptions.pageSize = { width: 80000, height: 200000 }; // 80mm x 200mm in microns
      } else {
        printOptions.pageSize = 'A4';
      }

      return new Promise((resolve) => {
        printWin.webContents.print(printOptions, (success, failureReason) => {
          printWin.destroy();
          resolve({ success, failureReason });
        });
      });
    } catch (err) {
      if (!printWin.isDestroyed()) printWin.destroy();
      return { success: false, failureReason: err.message };
    }
  });

  // Helper to guarantee report styles are inlined in data: URL print windows
  const ensureReportStyles = (htmlContent) => {
    if (htmlContent.includes('<style') && (htmlContent.includes('report-document') || htmlContent.includes('--report-accent'))) {
      return htmlContent;
    }
    const cssPath = path.join(__dirname, '../../dist/report.css');
    if (fs.existsSync(cssPath)) {
      const css = fs.readFileSync(cssPath, 'utf8');
      if (htmlContent.includes('</head>')) {
        return htmlContent.replace('</head>', `<style id="injected-report-styles">${css}</style></head>`);
      }
      return `<style id="injected-report-styles">${css}</style>${htmlContent}`;
    }
    return htmlContent;
  };

  // Print Report (A4 Clinical)
  ipcMain.handle('print:report', async (event, { html, silent = false, printerName = '' }) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false
      }
    });

    try {
      const styledHtml = ensureReportStyles(html);
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styledHtml)}`);

      const printOptions = {
        silent: silent,
        pageSize: 'A4',
        landscape: false,
        printBackground: true,
        deviceName: printerName || undefined
      };

      return new Promise((resolve) => {
        printWin.webContents.print(printOptions, (success, failureReason) => {
          if (!printWin.isDestroyed()) printWin.destroy();
          resolve({ success, failureReason });
        });
      });
    } catch (err) {
      if (!printWin.isDestroyed()) printWin.destroy();
      return { success: false, failureReason: err.message };
    }
  });

  // Export PDF (Save Dialog)
  ipcMain.handle('print:to-pdf', async (event, { html, defaultFilename = 'report.pdf' }) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false
      }
    });

    try {
      const styledHtml = ensureReportStyles(html);
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styledHtml)}`);
      const pdfData = await printWin.webContents.printToPDF({
        pageSize: 'A4',
        landscape: false,
        printBackground: true
      });
      if (!printWin.isDestroyed()) printWin.destroy();

      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Report as PDF',
        defaultPath: defaultFilename,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      fs.writeFileSync(filePath, pdfData);
      return { success: true, filePath };
    } catch (err) {
      if (!printWin.isDestroyed()) printWin.destroy();
      return { success: false, error: err.message };
    }
  });

  // Open External URL safely (WhatsApp, Email, Tel)
  ipcMain.handle('shell:open-external', async (event, url) => {
    if (typeof url !== 'string') return false;
    const allowed = ['https://wa.me/', 'https://', 'mailto:', 'tel:'];
    if (allowed.some(prefix => url.startsWith(prefix))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });
}
