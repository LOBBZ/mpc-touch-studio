// Electron-hoofdproces: draait de web-app als desktop-app (Windows / macOS).
// Web MIDI werkt hier direct (loopMIDI op Windows, IAC-driver op Mac) — de netwerk-bridge is dan niet nodig.
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#1c2226', title: 'MPC Touch Studio',
    icon: path.join(__dirname, '..', 'www', 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required' }
  });
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  // Externe links (bv. loopMIDI) in de gewone browser openen
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  const allowed = new Set(['midi', 'midiSysex', 'media', 'audioCapture', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
