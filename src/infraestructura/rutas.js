// Donde estan la base, los documentos y la base de la version estable.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const share = require('./compartir');
const { IS_VIEWER } = require('./config');
const { ctx } = require('./contexto');

function dbPath() { return path.join(app.getPath('userData'), 'alquileres.sqlite'); }

function docsDir() {
  return IS_VIEWER ? share.sharedDocsPath(ctx.viewer.dir || '') : path.join(app.getPath('userData'), 'documentos');
}

// Base de la version estable instalada (para que la de prueba arranque con datos reales).
function liveDbPath() { return path.join(app.getPath('appData'), 'Admin Alquileres', 'alquileres.sqlite'); }

function liveDbAvailable() { const p = liveDbPath(); return p !== dbPath() && fs.existsSync(p); }

Object.assign(module.exports, { dbPath, docsDir, liveDbPath, liveDbAvailable });
