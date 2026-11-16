// Electron-hoofdproces: draait MPC Touch Studio als Windows/macOS-app.
// Web MIDI werkt hier direct (MPC/keyboard via USB; naar FL Studio via loopMIDI).
// De meegeleverde bridge (MPC-Touch-Bridge.exe) start vanzelf mee: daarmee laadt de app je eigen VST3-plugins.
const { app, BrowserWindow, session, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');

let bridge = null;

// ---- VMPC2000XL (open-source MPC2000XL, GPL-3.0) die met de app wordt meegeleverd
const VMPC_DIR = path.join(process.resourcesPath || '', 'vmpc');
function vmpcApp() {
  const p = process.platform === 'win32' ? path.join(VMPC_DIR, 'VMPC2000XL.exe') : path.join(VMPC_DIR, 'VMPC2000XL.app');
  return fs.existsSync(p) ? p : null;
}
ipcMain.handle('vmpc-info', () => ({ installed: !!vmpcApp(), vst3: fs.existsSync(path.join(VMPC_DIR, 'VMPC2000XL.vst3')), platform: process.platform }));
ipcMain.handle('vmpc-launch', () => {
  const p = vmpcApp();
  if (!p) return { ok: false, error: 'VMPC2000XL zit niet in deze installatie' };
  try {
    const child = process.platform === 'darwin' ? spawn('open', [p], { detached: true, stdio: 'ignore' }) : spawn(p, [], { detached: true, stdio: 'ignore', cwd: VMPC_DIR });
    child.unref();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});
ipcMain.handle('vmpc-folder', (_e, which) => { shell.openPath(which === 'vst3' ? VMPC_DIR : path.join(app.getPath('documents'), 'VMPC2000XL')); return true; });
const BRIDGE_PORT = 8765;

function bridgePin() {
  const f = path.join(app.getPath('userData'), 'bridge-pin.txt');
  try { const p = fs.readFileSync(f, 'utf8').trim(); if (/^\d{6}$/.test(p)) return p; } catch (e) {}
  const p = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, p); } catch (e) {}
  return p;
}

function startBridge(pin) {
  const exe = path.join(process.resourcesPath || '', 'bridge', process.platform === 'win32' ? 'MPC-Touch-Bridge.exe' : 'MPC-Touch-Bridge');
  if (!fs.existsSync(exe)) return false;
  try {
    let out = 'ignore';
    try { out = fs.openSync(path.join(app.getPath('userData'), 'bridge.log'), 'w'); } catch (e) {}
    bridge = spawn(exe, ['--port', String(BRIDGE_PORT), '--pin', pin], { windowsHide: true, stdio: ['ignore', out, out] });
    bridge.on('error', () => { bridge = null; });
    bridge.on('exit', () => { bridge = null; });
    return true;
  } catch (e) { bridge = null; return false; }
}

function createWindow(query) {
  const win = new BrowserWindow({
    width: 1400, height: 920, minWidth: 900, minHeight: 600,
    backgroundColor: '#1c2226', title: 'MPC Touch Studio',
    icon: path.join(__dirname, '..', 'www', 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required', preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'), { query });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  const allowed = new Set(['midi', 'midiSysex', 'media', 'audioCapture', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  const pin = bridgePin();
  const query = startBridge(pin) ? { bridge: `http://127.0.0.1:${BRIDGE_PORT}`, pin } : {};
  createWindow(query);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(query); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { if (bridge) { try { bridge.kill(); } catch (e) {} } });
