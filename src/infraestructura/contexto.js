// Lo que comparten los modulos del proceso principal: la base abierta, la ventana, si la app
// se esta cerrando (para no ocultarla en la bandeja) y, en el Visor, que carpeta compartida lee.
const ctx = {
  store: null,
  win: null,
  isQuitting: false,
  viewer: { dir: null, mtime: 0, lastLoad: null, error: null },
};

module.exports = { ctx };
