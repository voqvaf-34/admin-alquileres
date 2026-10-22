// Donde estan la base y los documentos.
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


Object.assign(module.exports, { dbPath, docsDir });
