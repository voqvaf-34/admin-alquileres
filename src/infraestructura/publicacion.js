// Editor: publica una copia de la base en la carpeta compartida para el Visor.
const share = require('./compartir');
const { ctx } = require('./contexto');
const { CARPETA_COMPARTIDA_PREDETERMINADA } = require('./config');
const { rutaBase, carpetaDocs } = require('./rutas');

// La base principal sigue siendo la local; la compartida es una copia para el Visor
// (y un respaldo extra). Si la carpeta no esta disponible, se reintenta sola.
const estadoCompartido = { lastPublished: null, error: null, pending: false };

let publishTimer = null, retryTimer = null;

function carpetaCompartida() {
  if (process.env.ADMIN_ALQ_SHARED_DIR) return process.env.ADMIN_ALQ_SHARED_DIR;
  const s = ctx.store.obtenerAjustes();
  if (s.sharedDir === '-') return null;                     // desactivado a mano
  return s.sharedDir || CARPETA_COMPARTIDA_PREDETERMINADA;
}

function estadoCompartir() {
  return { dir: ctx.store ? carpetaCompartida() : null, ...estadoCompartido };
}

function avisarCompartir() {
  if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send('share:changed', estadoCompartir());
}

function publicarAhora() {
  clearTimeout(publishTimer); publishTimer = null;
  const dir = carpetaCompartida();
  if (!dir) { estadoCompartido.pending = false; avisarCompartir(); return; }
  try {
    const info = share.publicar({ dbFile: rutaBase(), carpetaDocs: carpetaDocs(), sharedDir: dir, by: process.env.USERNAME });
    Object.assign(estadoCompartido, { lastPublished: info.publicado, error: null, pending: false });
    clearInterval(retryTimer); retryTimer = null;
  } catch (e) {
    Object.assign(estadoCompartido, { error: e.code === 'ENOENT' || e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY'
      ? 'Carpeta compartida no disponible (¿la PC está apagada?). Se reintenta sola.' : e.message, pending: true });
    if (!retryTimer) retryTimer = setInterval(publicarAhora, 60000);
  }
  avisarCompartir();
}

function conectarCompartir() {
  ctx.store.onPersist = () => {
    estadoCompartido.pending = true;
    clearTimeout(publishTimer);
    publishTimer = setTimeout(publicarAhora, 1500);
  };
  setTimeout(publicarAhora, 2000);
}

Object.assign(module.exports, { estadoCompartir, publicarAhora, conectarCompartir });
