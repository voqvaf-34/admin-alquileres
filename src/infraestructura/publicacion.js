// Editor: publica una copia de la base en la carpeta compartida para el Visor.
const share = require('./compartir');
const { ctx } = require('./contexto');
const { DEFAULT_SHARED_DIR } = require('./config');
const { dbPath, docsDir } = require('./rutas');

// La base principal sigue siendo la local; la compartida es una copia para el Visor
// (y un respaldo extra). Si la carpeta no esta disponible, se reintenta sola.
const shareState = { lastPublished: null, error: null, pending: false };

let publishTimer = null, retryTimer = null;

function sharedDir() {
  if (process.env.ADMIN_ALQ_SHARED_DIR) return process.env.ADMIN_ALQ_SHARED_DIR;
  const s = ctx.store.getSettings();
  if (s.sharedDir === '-') return null;                     // desactivado a mano
  return s.sharedDir || DEFAULT_SHARED_DIR;
}

function shareStatus() {
  return { dir: ctx.store ? sharedDir() : null, ...shareState };
}

function notifyShare() {
  if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send('share:changed', shareStatus());
}

function publishNow() {
  clearTimeout(publishTimer); publishTimer = null;
  const dir = sharedDir();
  if (!dir) { shareState.pending = false; notifyShare(); return; }
  try {
    const info = share.publish({ dbFile: dbPath(), docsDir: docsDir(), sharedDir: dir, by: process.env.USERNAME });
    Object.assign(shareState, { lastPublished: info.publicado, error: null, pending: false });
    clearInterval(retryTimer); retryTimer = null;
  } catch (e) {
    Object.assign(shareState, { error: e.code === 'ENOENT' || e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY'
      ? 'Carpeta compartida no disponible (¿la PC está apagada?). Se reintenta sola.' : e.message, pending: true });
    if (!retryTimer) retryTimer = setInterval(publishNow, 60000);
  }
  notifyShare();
}

function attachSharing() {
  ctx.store.onPersist = () => {
    shareState.pending = true;
    clearTimeout(publishTimer);
    publishTimer = setTimeout(publishNow, 1500);
  };
  setTimeout(publishNow, 2000);
}

Object.assign(module.exports, { shareState, sharedDir, shareStatus, notifyShare, publishNow, attachSharing });
