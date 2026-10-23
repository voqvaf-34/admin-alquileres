// Visor: lee la base compartida (solo lectura) y se actualiza solo.
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { BaseDatos } = require('./base-datos');
const share = require('./compartir');
const { ctx } = require('./contexto');
const { CARPETA_COMPARTIDA_PREDETERMINADA, INTERVALO_SONDEO_MS } = require('./config');
const estadoApp = require('./estado-app');


function archivoConfigVisor() { return path.join(app.getPath('userData'), 'visor.json'); }

function estadoVisor() { return { dir: ctx.viewer.dir, lastLoad: ctx.viewer.lastLoad, publicado: ctx.viewer.dir ? (share.leerInfo(ctx.viewer.dir) || {}).publicado : null, error: ctx.viewer.error }; }

async function cargarVisor() {
  if (!ctx.viewer.dir) {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(archivoConfigVisor(), 'utf8')); } catch (_) {}
    ctx.viewer.dir = process.env.ADMIN_ALQ_SHARED_DIR || cfg.sharedDir || CARPETA_COMPARTIDA_PREDETERMINADA;
  }
  if (!ctx.viewer.dir) { ctx.viewer.error = 'Todavía no se eligió la carpeta compartida.'; return; }
  try {
    const siguiente = await BaseDatos.open(share.rutaBaseCompartida(ctx.viewer.dir), { readOnly: true });
    if (ctx.store) ctx.store.close();
    ctx.store = siguiente;
    ctx.viewer.mtime = share.fechaModBase(ctx.viewer.dir);
    ctx.viewer.lastLoad = new Date().toISOString();
    ctx.viewer.error = null;
  } catch (e) {
    ctx.viewer.error = e.message;
  }
}

function iniciarSondeoVisor() {
  setInterval(async () => {
    const m = ctx.viewer.dir && share.fechaModBase(ctx.viewer.dir);
    if (!m || m === ctx.viewer.mtime) return;
    await new Promise(r => setTimeout(r, 400));            // que termine de escribirse
    await cargarVisor();
    if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send('data:changed', estadoVisor());
  }, INTERVALO_SONDEO_MS);
}

async function elegirCarpetaVisor() {
  const res = await dialog.showOpenDialog(ctx.win, {
    title: 'Elegir la carpeta compartida de Admin Alquileres', properties: ['openDirectory'],
    defaultPath: CARPETA_COMPARTIDA_PREDETERMINADA && fs.existsSync(CARPETA_COMPARTIDA_PREDETERMINADA) ? CARPETA_COMPARTIDA_PREDETERMINADA : undefined,
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const dir = res.filePaths[0];
  if (!fs.existsSync(share.rutaBaseCompartida(dir))) throw new Error('En esa carpeta no está la base compartida (alquileres.sqlite).');
  ctx.viewer.dir = dir;
  fs.writeFileSync(archivoConfigVisor(), JSON.stringify({ sharedDir: dir }));
  await cargarVisor();
  return estadoApp.state();
}

Object.assign(module.exports, { estadoVisor, cargarVisor, iniciarSondeoVisor, elegirCarpetaVisor });
