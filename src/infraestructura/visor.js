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

function estadoVisor() { return { carpeta: ctx.visor.carpeta, ultimaCarga: ctx.visor.ultimaCarga, publicado: ctx.visor.carpeta ? (share.leerInfo(ctx.visor.carpeta) || {}).publicado : null, error: ctx.visor.error }; }

async function cargarVisor() {
  if (!ctx.visor.carpeta) {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(archivoConfigVisor(), 'utf8')); } catch (_) {}
    // cfg.sharedDir: archivo de configuracion del Visor de hasta la 0.8.1.
    ctx.visor.carpeta = process.env.ADMIN_ALQ_SHARED_DIR || cfg.carpetaCompartida || cfg.sharedDir || CARPETA_COMPARTIDA_PREDETERMINADA;
  }
  if (!ctx.visor.carpeta) { ctx.visor.error = 'Todavía no se eligió la carpeta compartida.'; return; }
  try {
    const siguiente = await BaseDatos.open(share.rutaBaseCompartida(ctx.visor.carpeta), { soloLectura: true });
    if (ctx.base) ctx.base.close();
    ctx.base = siguiente;
    ctx.visor.mtime = share.fechaModBase(ctx.visor.carpeta);
    ctx.visor.ultimaCarga = new Date().toISOString();
    ctx.visor.error = null;
  } catch (e) {
    ctx.visor.error = e.message;
  }
}

function iniciarSondeoVisor() {
  setInterval(async () => {
    const m = ctx.visor.carpeta && share.fechaModBase(ctx.visor.carpeta);
    if (!m || m === ctx.visor.mtime) return;
    await new Promise(r => setTimeout(r, 400));            // que termine de escribirse
    await cargarVisor();
    if (ctx.ventana && !ctx.ventana.isDestroyed()) ctx.ventana.webContents.send('datos:cambiados', estadoVisor());
  }, INTERVALO_SONDEO_MS);
}

async function elegirCarpetaVisor() {
  const res = await dialog.showOpenDialog(ctx.ventana, {
    title: 'Elegir la carpeta compartida de Admin Alquileres', properties: ['openDirectory'],
    defaultPath: CARPETA_COMPARTIDA_PREDETERMINADA && fs.existsSync(CARPETA_COMPARTIDA_PREDETERMINADA) ? CARPETA_COMPARTIDA_PREDETERMINADA : undefined,
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const dir = res.filePaths[0];
  if (!fs.existsSync(share.rutaBaseCompartida(dir))) throw new Error('En esa carpeta no está la base compartida (alquileres.sqlite).');
  ctx.visor.carpeta = dir;
  fs.writeFileSync(archivoConfigVisor(), JSON.stringify({ carpetaCompartida: dir }));
  await cargarVisor();
  return estadoApp.estado();
}

Object.assign(module.exports, { estadoVisor, cargarVisor, iniciarSondeoVisor, elegirCarpetaVisor });
