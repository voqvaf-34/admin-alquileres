// Publicacion de la base en una carpeta compartida para la app "Visor".
const fs   = require('fs');
const path = require('path');

const BASE_COMPARTIDA   = 'alquileres.sqlite';
const DOCS_COMPARTIDOS = 'documentos';
const ARCHIVO_INFO   = 'publicado.json';

const rutaBaseCompartida   = dir => path.join(dir, BASE_COMPARTIDA);
const rutaDocsCompartidos = dir => path.join(dir, DOCS_COMPARTIDOS);

// Copia la base a la carpeta compartida: primero a un temporal y despues se renombra,
// asi el visor nunca lee un archivo a medio copiar. Las fotos se copian si faltan.
function publicar({ dbFile, carpetaDocs, sharedDir, by }) {
  fs.mkdirSync(sharedDir, { recursive: true });
  const tmp = path.join(sharedDir, `${BASE_COMPARTIDA}.tmp-${process.pid}`);
  fs.copyFileSync(dbFile, tmp);
  fs.renameSync(tmp, rutaBaseCompartida(sharedDir));
  if (carpetaDocs && fs.existsSync(carpetaDocs)) {
    const dst = rutaDocsCompartidos(sharedDir);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(carpetaDocs)) {
      const to = path.join(dst, f);
      if (!fs.existsSync(to)) fs.copyFileSync(path.join(carpetaDocs, f), to);
    }
  }
  const info = { publicado: new Date().toISOString(), por: by || '' };
  fs.writeFileSync(path.join(sharedDir, ARCHIVO_INFO), JSON.stringify(info));
  return info;
}

function leerInfo(sharedDir) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, ARCHIVO_INFO), 'utf8')); } catch (_) { return null; }
}

function fechaModBase(sharedDir) {
  try { return fs.statSync(rutaBaseCompartida(sharedDir)).mtimeMs; } catch (_) { return 0; }
}

module.exports = { publicar, leerInfo, fechaModBase, rutaBaseCompartida, rutaDocsCompartidos };
