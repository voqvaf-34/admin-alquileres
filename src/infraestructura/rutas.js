// Donde estan la base y los documentos.
const { app } = require('electron');
const path = require('path');
const share = require('./compartir');
const { ES_VISOR } = require('./config');
const { ctx } = require('./contexto');

function rutaBase() { return path.join(app.getPath('userData'), 'alquileres.sqlite'); }

function carpetaDocs() {
  return ES_VISOR ? share.rutaDocsCompartidos(ctx.visor.carpeta || '') : path.join(app.getPath('userData'), 'documentos');
}


Object.assign(module.exports, { rutaBase, carpetaDocs });
