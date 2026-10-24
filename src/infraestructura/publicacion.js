// Editor: publica una copia de la base en la carpeta compartida para el Visor.
const share = require('./compartir');
const { ctx } = require('./contexto');
const { CARPETA_COMPARTIDA_PREDETERMINADA } = require('./config');
const { rutaBase, carpetaDocs } = require('./rutas');

// La base principal sigue siendo la local; la compartida es una copia para el Visor
// (y un respaldo extra). Si la carpeta no esta disponible, se reintenta sola.
const estadoCompartido = { ultimaPublicacion: null, error: null, pendiente: false };

let temporizadorPublicar = null, temporizadorReintento = null;

function carpetaCompartida() {
  if (process.env.ADMIN_ALQ_SHARED_DIR) return process.env.ADMIN_ALQ_SHARED_DIR;
  const s = ctx.base.obtenerAjustes();
  if (s.carpetaCompartida === '-') return null;   // desactivado a mano
  return s.carpetaCompartida || CARPETA_COMPARTIDA_PREDETERMINADA;
}

function estadoCompartir() {
  return { carpeta: ctx.base ? carpetaCompartida() : null, ...estadoCompartido };
}

function avisarCompartir() {
  if (ctx.ventana && !ctx.ventana.isDestroyed()) ctx.ventana.webContents.send('share:changed', estadoCompartir());
}

function publicarAhora() {
  clearTimeout(temporizadorPublicar); temporizadorPublicar = null;
  const dir = carpetaCompartida();
  if (!dir) { estadoCompartido.pendiente = false; avisarCompartir(); return; }
  try {
    const info = share.publicar({ archivoBase: rutaBase(), carpetaDocs: carpetaDocs(), carpetaCompartida: dir, por: process.env.USERNAME });
    Object.assign(estadoCompartido, { ultimaPublicacion: info.publicado, error: null, pendiente: false });
    clearInterval(temporizadorReintento); temporizadorReintento = null;
  } catch (e) {
    Object.assign(estadoCompartido, { error: e.code === 'ENOENT' || e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY'
      ? 'Carpeta compartida no disponible (¿la PC está apagada?). Se reintenta sola.' : e.message, pendiente: true });
    if (!temporizadorReintento) temporizadorReintento = setInterval(publicarAhora, 60000);
  }
  avisarCompartir();
}

function conectarCompartir() {
  ctx.base.alPersistir = () => {
    estadoCompartido.pendiente = true;
    clearTimeout(temporizadorPublicar);
    temporizadorPublicar = setTimeout(publicarAhora, 1500);
  };
  setTimeout(publicarAhora, 2000);
}

Object.assign(module.exports, { estadoCompartir, publicarAhora, conectarCompartir });
