// Publicacion de la base en una carpeta compartida para la app "Visor".
const fs   = require('fs');
const path = require('path');

const SHARED_DB   = 'alquileres.sqlite';
const SHARED_DOCS = 'documentos';
const INFO_FILE   = 'publicado.json';

const sharedDbPath   = dir => path.join(dir, SHARED_DB);
const sharedDocsPath = dir => path.join(dir, SHARED_DOCS);

// Copia la base a la carpeta compartida: primero a un temporal y despues se renombra,
// asi el visor nunca lee un archivo a medio copiar. Las fotos se copian si faltan.
function publish({ dbFile, docsDir, sharedDir, by }) {
  fs.mkdirSync(sharedDir, { recursive: true });
  const tmp = path.join(sharedDir, `${SHARED_DB}.tmp-${process.pid}`);
  fs.copyFileSync(dbFile, tmp);
  fs.renameSync(tmp, sharedDbPath(sharedDir));
  if (docsDir && fs.existsSync(docsDir)) {
    const dst = sharedDocsPath(sharedDir);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(docsDir)) {
      const to = path.join(dst, f);
      if (!fs.existsSync(to)) fs.copyFileSync(path.join(docsDir, f), to);
    }
  }
  const info = { publicado: new Date().toISOString(), por: by || '' };
  fs.writeFileSync(path.join(sharedDir, INFO_FILE), JSON.stringify(info));
  return info;
}

function readInfo(sharedDir) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, INFO_FILE), 'utf8')); } catch (_) { return null; }
}

function dbMtime(sharedDir) {
  try { return fs.statSync(sharedDbPath(sharedDir)).mtimeMs; } catch (_) { return 0; }
}

module.exports = { publish, readInfo, dbMtime, sharedDbPath, sharedDocsPath };
