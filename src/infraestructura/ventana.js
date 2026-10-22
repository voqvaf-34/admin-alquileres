// Ventana principal e icono en la bandeja de Windows.
const { app, BrowserWindow, shell, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { ctx } = require('./contexto');
const { ICON, START_HIDDEN_ARG, TITLEBAR_H, TRAY_ICON } = require('./config');

let tray = null;

let trayHintShown = false;

// Color de la barra (el de la marca). Se recuerda en un archivo para usarlo al abrir la
// ventana, antes de leer la base.
const BARRA_DEFAULT = { color: '#2563EB', ink: '#FFFFFF' };
const esHex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const barraFile = () => path.join(app.getPath('userData'), 'ventana.json');

function leerBarra() {
  try {
    const b = JSON.parse(fs.readFileSync(barraFile(), 'utf8'));
    if (esHex(b.color) && esHex(b.ink)) return b;
  } catch (_) {}
  return BARRA_DEFAULT;
}

function setTitleBarColor(color, ink) {
  if (!esHex(color) || !esHex(ink)) throw new Error('Color no valido.');
  if (ctx.win && !ctx.win.isDestroyed()) {
    ctx.win.setBackgroundColor(color);
    if (process.platform === 'win32') ctx.win.setTitleBarOverlay({ color, symbolColor: ink, height: TITLEBAR_H });
  }
  const prev = leerBarra();
  if (prev.color !== color || prev.ink !== ink) fs.writeFileSync(barraFile(), JSON.stringify({ color, ink }));
  return true;
}

function showWindow() {
  if (!ctx.win) return;
  if (ctx.win.isMinimized()) ctx.win.restore();
  ctx.win.show();
  ctx.win.focus();
}

function quitApp() {
  ctx.isQuitting = true;
  app.quit();
}

// "Iniciar con Windows" solo tiene sentido en la app instalada (no con `npm start`).
function loginItemEnabled() {
  return app.isPackaged && app.getLoginItemSettings({ args: [START_HIDDEN_ARG] }).openAtLogin;
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: `Abrir ${app.getName()}`, click: showWindow },
    { type: 'separator' },
    {
      label: 'Iniciar con Windows', type: 'checkbox', checked: loginItemEnabled(), enabled: app.isPackaged,
      click: item => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: [START_HIDDEN_ARG] });
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { type: 'separator' },
    { label: 'Cerrar', click: quitApp },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip(app.getName());
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showWindow);
}

function createWindow({ hidden = false } = {}) {
  const barra = leerBarra();
  ctx.win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: barra.color,
    title: app.getName(),
    icon: ICON,
    show: false,
    autoHideMenuBar: true,
    // La barra de titulo de Windows se integra a la barra de color de la app: quedan solo los
    // botones minimizar/maximizar/cerrar dibujados sobre el color de la marca.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: barra.color, symbolColor: barra.ink, height: TITLEBAR_H },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links externos (WhatsApp, mailto) se abren fuera de la app. En las pruebas automaticas
  // (ADMIN_ALQ_NO_EXTERNAL) nunca se abren: solo se anotan.
  const openExt = url => {
    if (!/^(https:|mailto:)/i.test(url)) return;
    if (process.env.ADMIN_ALQ_NO_EXTERNAL) { (global.blockedExternal = global.blockedExternal || []).push(url); return; }
    shell.openExternal(url);
  };
  ctx.win.webContents.setWindowOpenHandler(({ url }) => { openExt(url); return { action: 'deny' }; });
  ctx.win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); openExt(url); }
  });

  // Se muestra cuando el tema ya esta aplicado (evita el destello inicial).
  ctx.win.once('ready-to-show', () => { if (!hidden) ctx.win.show(); });

  // Cerrar la ventana la oculta en la bandeja; solo "Cerrar" del menu de la bandeja sale.
  ctx.win.on('close', e => {
    if (ctx.isQuitting) return;
    e.preventDefault();
    ctx.win.hide();
    if (!trayHintShown && tray) {
      trayHintShown = true;
      tray.displayBalloon({
        iconType: 'info', title: app.getName(),
        content: 'Sigue abierta en la bandeja. Para cerrarla del todo: clic derecho en el icono > Cerrar.',
      });
    }
  });

  ctx.win.loadFile(path.join(__dirname, '..', 'interfaz', 'index.html'));
}

Object.assign(module.exports, { setTitleBarColor, showWindow, quitApp, loginItemEnabled, buildTrayMenu, createTray, createWindow });
