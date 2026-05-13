// Electron entry point for the ORBLOOD desktop app.
//
// Features:
//   1. Direct connection to orblood.ir (no URL prompt)
//   2. Native app feel with custom titlebar
//   3. Refresh button in bottom-left
//   4. Update checker with download button
//   5. Auto-update from GitHub releases

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const https = require('node:https');
const fs = require('node:fs');

// Configuration
const APP_URL = 'https://orblood.ir';
const GITHUB_REPO = 'DiyakoMk/meeting';
const UPDATE_CHECK_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

let mainWindow = null;
let updateAvailable = false;
let latestVersion = null;
let downloadUrl = null;

// Check for updates from GitHub releases
async function checkForUpdates() {
  return new Promise((resolve) => {
    https.get(UPDATE_CHECK_URL, {
      headers: { 'User-Agent': 'Orblood-Desktop' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const currentVersion = app.getVersion();
          const remoteVersion = release.tag_name.replace(/^v/, '');
          
          if (remoteVersion !== currentVersion) {
            // Find Windows executable in assets
            const asset = release.assets.find(a => 
              a.name.endsWith('.exe') || a.name.endsWith('-win.zip')
            );
            
            if (asset) {
              updateAvailable = true;
              latestVersion = remoteVersion;
              downloadUrl = asset.browser_download_url;
              
              if (mainWindow) {
                mainWindow.webContents.send('update-available', {
                  version: remoteVersion,
                  url: downloadUrl
                });
              }
            }
          }
          resolve({ available: updateAvailable, version: remoteVersion });
        } catch (e) {
          console.error('[update] Failed to parse release:', e);
          resolve({ available: false });
        }
      });
    }).on('error', (e) => {
      console.error('[update] Check failed:', e);
      resolve({ available: false });
    });
  });
}

// Download update
function downloadUpdate() {
  if (!downloadUrl) return;
  
  shell.openExternal(downloadUrl).catch(err => {
    dialog.showErrorBox('Download Failed', 
      'Could not open download link. Please visit:\n' + downloadUrl
    );
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: '#020103',
    autoHideMenuBar: true,
    frame: true, // Keep native frame for now, can be customized later
    title: 'ORBLOOD',
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Need this for IPC
    }
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Inject custom CSS and controls after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      /* Desktop app custom controls */
      .electron-controls {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 999999;
        display: flex;
        gap: 10px;
      }
      
      .electron-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(20, 20, 30, 0.95);
        border: 1px solid rgba(139, 92, 246, 0.3);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      
      .electron-btn:hover {
        background: rgba(139, 92, 246, 0.2);
        border-color: rgba(139, 92, 246, 0.6);
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(139, 92, 246, 0.3);
      }
      
      .electron-btn:active {
        transform: translateY(0);
      }
      
      .electron-btn svg {
        width: 18px;
        height: 18px;
        stroke: rgba(139, 92, 246, 0.9);
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      
      .electron-btn.update-available {
        animation: pulse 2s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3); }
        50% { box-shadow: 0 4px 20px rgba(139, 92, 246, 0.6); }
      }
    `);

    mainWindow.webContents.executeJavaScript(`
      (function() {
        // Remove existing controls if any
        const existing = document.querySelector('.electron-controls');
        if (existing) existing.remove();
        
        // Create controls container
        const controls = document.createElement('div');
        controls.className = 'electron-controls';
        
        // Refresh button
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'electron-btn';
        refreshBtn.title = 'Refresh';
        refreshBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';
        refreshBtn.onclick = () => window.electronAPI.refresh();
        
        // Update/Download button
        const updateBtn = document.createElement('button');
        updateBtn.className = 'electron-btn';
        updateBtn.title = 'Check for updates';
        updateBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
        updateBtn.onclick = () => window.electronAPI.checkUpdate();
        
        controls.appendChild(refreshBtn);
        controls.appendChild(updateBtn);
        document.body.appendChild(controls);
        
        // Listen for update notifications
        window.electronAPI.onUpdateAvailable((data) => {
          updateBtn.classList.add('update-available');
          updateBtn.title = 'Update available: v' + data.version + ' (click to download)';
          updateBtn.onclick = () => window.electronAPI.downloadUpdate();
        });
      })();
    `);
  });

  // Load the app
  await mainWindow.loadURL(APP_URL);
  
  // Check for updates after 3 seconds
  setTimeout(() => checkForUpdates(), 3000);
  
  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// IPC handlers
ipcMain.handle('refresh', () => {
  if (mainWindow) {
    mainWindow.reload();
  }
});

ipcMain.handle('check-update', async () => {
  const result = await checkForUpdates();
  if (result.available) {
    return { available: true, version: latestVersion, url: downloadUrl };
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'No Updates',
      message: 'You are running the latest version.',
      buttons: ['OK']
    });
    return { available: false };
  }
});

ipcMain.handle('download-update', () => {
  downloadUpdate();
});

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// Handle app updates
app.on('before-quit', () => {
  // Cleanup if needed
});
