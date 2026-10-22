// Visor: lee la base compartida (solo lectura) y se actualiza solo.
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./base-datos');
const share = require('./compartir');
const { ctx } = require('./contexto');
const { DEFAULT_SHARED_DIR, POLL_MS } = require('./config');
const estadoApp = require('./estado-app');
const publicacion = require('./publicacion');


function viewerConfigFile() { return path.join(app.getPath('userData'), 'visor.json'); }

function viewerStatus() { return { dir: ctx.viewer.dir, lastLoad: ctx.viewer.lastLoad, publicado: ctx.viewer.dir ? (share.readInfo(ctx.viewer.dir) || {}).publicado : null, error: ctx.viewer.error }; }

async function loadViewer() {
  if (!ctx.viewer.dir) {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(viewerConfigFile(), 'utf8')); } catch (_) {}
    ctx.viewer.dir = process.env.ADMIN_ALQ_SHARED_DIR || cfg.sharedDir || DEFAULT_SHARED_DIR;
  }
  if (!ctx.viewer.dir) { ctx.viewer.error = 'Todavía no se eligió la carpeta compartida.'; return; }
  try {
    const next = await Store.open(share.sharedDbPath(ctx.viewer.dir), { readOnly: true });
    if (ctx.store) ctx.store.close();
    ctx.store = next;
    ctx.viewer.mtime = share.dbMtime(ctx.viewer.dir);
    ctx.viewer.lastLoad = new Date().toISOString();
    ctx.viewer.error = null;
  } catch (e) {
    ctx.viewer.error = e.message;
  }
}

function startViewerPolling() {
  setInterval(async () => {
    const m = ctx.viewer.dir && share.dbMtime(ctx.viewer.dir);
    if (!m || m === ctx.viewer.mtime) return;
    await new Promise(r => setTimeout(r, 400));            // que termine de escribirse
    await loadViewer();
    if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send('data:changed', viewerStatus());
  }, POLL_MS);
}

async function pickViewerDir() {
  const res = await dialog.showOpenDialog(ctx.win, {
    title: 'Elegir la carpeta compartida de Admin Alquileres', properties: ['openDirectory'],
    defaultPath: DEFAULT_SHARED_DIR && fs.existsSync(DEFAULT_SHARED_DIR) ? DEFAULT_SHARED_DIR : undefined,
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const dir = res.filePaths[0];
  if (!fs.existsSync(share.sharedDbPath(dir))) throw new Error('En esa carpeta no está la base compartida (alquileres.sqlite).');
  ctx.viewer.dir = dir;
  fs.writeFileSync(viewerConfigFile(), JSON.stringify({ sharedDir: dir }));
  await loadViewer();
  return estadoApp.state();
}

Object.assign(module.exports, { viewerConfigFile, viewerStatus, loadViewer, startViewerPolling, pickViewerDir });
