// Ventana principal e icono en la bandeja de Windows.
const { app, BrowserWindow, shell, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { ctx } = require('./contexto');
const { ICONO, ARG_INICIO_OCULTO, ALTO_BARRA_TITULO, ICONO_BANDEJA } = require('./config');

let bandeja = null;

const FUERA_DE_PANTALLA = !!process.env.ADMIN_ALQ_FUERA_DE_PANTALLA;

let trayHintShown = false;

// Color de la barra (el de la marca). Se recuerda en un archivo para usarlo al abrir la
// ventana, antes de leer la base.
const BARRA_PREDETERMINADA = { color: '#2563EB', ink: '#FFFFFF' };
const esHex = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const archivoBarra = () => path.join(app.getPath('userData'), 'ventana.json');

function leerBarra() {
  try {
    const b = JSON.parse(fs.readFileSync(archivoBarra(), 'utf8'));
    if (esHex(b.color) && esHex(b.ink)) return b;
  } catch (_) {}
  return BARRA_PREDETERMINADA;
}

// Zoom de la ventana (Accesibilidad > Tamaño). La barra de Windows acompaña la altura de la cabecera.
let zoom = 1;
const alturaBarra = () => Math.round(ALTO_BARRA_TITULO * zoom);

function ponerColorBarraTitulo(color, tinta) {
  if (!esHex(color) || !esHex(tinta)) throw new Error('Color no valido.');
  if (ctx.win && !ctx.win.isDestroyed()) {
    ctx.win.setBackgroundColor(color);
    if (process.platform === 'win32') ctx.win.setTitleBarOverlay({ color, symbolColor: tinta, height: alturaBarra() });
  }
  const anterior = leerBarra();
  if (anterior.color !== color || anterior.ink !== tinta) fs.writeFileSync(archivoBarra(), JSON.stringify({ color, ink: tinta }));
  return true;
}

function ponerZoom(factor) {
  const f = Number(factor);
  if (!(f >= 0.8 && f <= 1.6)) throw new Error('Tamaño no valido.');
  zoom = f;
  if (ctx.win && !ctx.win.isDestroyed()) {
    ctx.win.webContents.setZoomFactor(f);
    const b = leerBarra();
    if (process.platform === 'win32') ctx.win.setTitleBarOverlay({ color: b.color, symbolColor: b.ink, height: alturaBarra() });
  }
  return true;
}

// Icono propio (generado del logo en la pantalla): ventana, barra de tareas y bandeja. Se guarda
// en un archivo para usarlo desde el arranque; sin archivo se usa el icono de la app.
const archivoIcono = () => path.join(app.getPath('userData'), 'icono.png');

function iconoActual() {
  try { if (fs.existsSync(archivoIcono())) { const img = nativeImage.createFromPath(archivoIcono()); if (!img.isEmpty()) return img; } } catch (_) {}
  return null;
}

const iconoBandeja = img => (img ? img.resize({ width: 32, height: 32, quality: 'best' }) : nativeImage.createFromPath(ICONO_BANDEJA));

// png: data URL de una imagen PNG, o '' para volver al icono de la app.
function ponerIconoApp(png) {
  let img = null;
  if (png) {
    if (typeof png !== 'string' || !png.startsWith('data:image/png;base64,') || png.length > 2 * 1024 * 1024) throw new Error('Icono no valido.');
    img = nativeImage.createFromDataURL(png);
    if (img.isEmpty()) throw new Error('Icono no valido.');
    fs.writeFileSync(archivoIcono(), img.toPNG());
  } else {
    try { fs.unlinkSync(archivoIcono()); } catch (_) {}
  }
  if (ctx.win && !ctx.win.isDestroyed()) ctx.win.setIcon(img || nativeImage.createFromPath(ICONO));
  if (bandeja && !bandeja.isDestroyed()) bandeja.setImage(iconoBandeja(img));
  return true;
}

function mostrarVentana() {
  if (!ctx.win) return;
  if (ctx.win.isMinimized()) ctx.win.restore();
  ctx.win.show();
  ctx.win.focus();
}

function salirDeApp() {
  ctx.isQuitting = true;
  app.quit();
}

// "Iniciar con Windows" solo tiene sentido en la app instalada (no con `npm start`).
function arranqueAutomaticoActivo() {
  return app.isPackaged && app.getLoginItemSettings({ args: [ARG_INICIO_OCULTO] }).openAtLogin;
}

function armarMenuBandeja() {
  return Menu.buildFromTemplate([
    { label: `Abrir ${app.getName()}`, click: mostrarVentana },
    { type: 'separator' },
    {
      label: 'Iniciar con Windows', type: 'checkbox', checked: arranqueAutomaticoActivo(), enabled: app.isPackaged,
      click: elemento => {
        app.setLoginItemSettings({ openAtLogin: elemento.checked, args: [ARG_INICIO_OCULTO] });
        bandeja.setContextMenu(armarMenuBandeja());
      },
    },
    { type: 'separator' },
    { label: 'Cerrar', click: salirDeApp },
  ]);
}

function crearBandeja() {
  if (FUERA_DE_PANTALLA) return;
  bandeja = new Tray(iconoBandeja(iconoActual()));
  bandeja.setToolTip(app.getName());
  bandeja.setContextMenu(armarMenuBandeja());
  bandeja.on('click', mostrarVentana);
}

function crearVentana({ hidden: oculto = false } = {}) {
  const barra = leerBarra();
  ctx.win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    // Pruebas automaticas: la ventana se abre fuera de la pantalla y sin aparecer en la barra de
    // tareas, para no tapar lo que este haciendo quien corre las pruebas.
    ...(FUERA_DE_PANTALLA ? { x: -20000, y: 0, skipTaskbar: true } : {}),
    backgroundColor: barra.color,
    title: app.getName(),
    icon: iconoActual() || ICONO,
    show: false,
    autoHideMenuBar: true,
    // La barra de titulo de Windows se integra a la barra de color de la app: quedan solo los
    // botones minimizar/maximizar/cerrar dibujados sobre el color de la marca.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: barra.color, symbolColor: barra.ink, height: alturaBarra() },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links externos (WhatsApp, mailto) se abren fuera de la app. En las pruebas automaticas
  // (ADMIN_ALQ_NO_EXTERNAL) nunca se abren: solo se anotan.
  const abrirExterno = url => {
    if (!/^(https:|mailto:)/i.test(url)) return;
    if (process.env.ADMIN_ALQ_NO_EXTERNAL) { (global.blockedExternal = global.blockedExternal || []).push(url); return; }
    shell.openExternal(url);
  };
  ctx.win.webContents.setWindowOpenHandler(({ url }) => { abrirExterno(url); return { action: 'deny' }; });
  ctx.win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); abrirExterno(url); }
  });

  // Se muestra cuando el tema ya esta aplicado (evita el destello inicial).
  ctx.win.once('ready-to-show', () => {
    if (oculto) return;
    if (FUERA_DE_PANTALLA) ctx.win.showInactive(); else ctx.win.show();
  });

  // Cerrar la ventana la oculta en la bandeja; solo "Cerrar" del menu de la bandeja sale.
  ctx.win.on('close', e => {
    if (ctx.isQuitting) return;
    e.preventDefault();
    ctx.win.hide();
    if (!trayHintShown && bandeja) {
      trayHintShown = true;
      bandeja.displayBalloon({
        iconType: 'info', title: app.getName(),
        content: 'Sigue abierta en la bandeja. Para cerrarla del todo: clic derecho en el icono > Cerrar.',
      });
    }
  });

  ctx.win.loadFile(path.join(__dirname, '..', 'interfaz', 'index.html'));
}

Object.assign(module.exports, { ponerZoom, ponerIconoApp, ponerColorBarraTitulo, mostrarVentana, crearBandeja, crearVentana });
