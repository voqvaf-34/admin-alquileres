// Documentos de propietarios (fotos de cedula).
const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { ctx } = require('./contexto');
const { carpetaDocs } = require('./rutas');

const EXTENSIONES_DOC = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'pdf', 'heic'];

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };

async function elegirDocsPropietario(idPropietario) {
  const res = await dialog.showOpenDialog(ctx.ventana, {
    title: 'Agregar foto de cedula', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Imagen o PDF', extensions: EXTENSIONES_DOC }],
  });
  if (res.canceled || !res.filePaths.length) return false;
  fs.mkdirSync(carpetaDocs(), { recursive: true });
  for (const src of res.filePaths) {
    const ext = path.extname(src).toLowerCase();
    const archivo = `prop${idPropietario}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`;
    fs.copyFileSync(src, path.join(carpetaDocs(), archivo));
    ctx.base.agregarDocPropietario(idPropietario, 'cedula', archivo, path.basename(src));
  }
  return true;
}

function archivoDoc(id) {
  const d = ctx.base.obtenerDocPropietario(id);
  if (!d) throw new Error('Documento inexistente.');
  const p = path.join(carpetaDocs(), path.basename(d.archivo));
  if (!fs.existsSync(p)) throw new Error('No se encontro el archivo del documento.');
  return { d, p };
}

function vistaPreviaDoc(id) {
  const { p } = archivoDoc(id);
  const ext = path.extname(p).slice(1).toLowerCase();
  if (!MIME[ext]) return { image: false };
  return { image: true, urlDatos: `data:${MIME[ext]};base64,${fs.readFileSync(p).toString('base64')}` };
}

Object.assign(module.exports, { elegirDocsPropietario, archivoDoc, vistaPreviaDoc });
