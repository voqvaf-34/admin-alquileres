// Lo que comparten los modulos del proceso principal: la base abierta, la ventana, si la app
// se esta cerrando (para no ocultarla en la bandeja) y, en el Visor, que carpeta compartida lee.
const ctx = {
  base: null,
  ventana: null,
  saliendo: false,
  visor: { carpeta: null, mtime: 0, ultimaCarga: null, error: null },
};

module.exports = { ctx };
