// Normalizacion de datos (direcciones, propietarios, limpieza, garantias, moneda), una vez por version.
const D = require('../dominios/index.js');
const { normalizarDireccion, planUnificarPropietarios } = require('../dominios/index.js');
const { ctx } = require('./contexto');
const { REGLAS_DIRECCIONES, VERSION_DIRECCIONES, VERSION_LIMPIEZA, VERSION_GARANTIAS, VERSION_MONEDA, VERSION_PROPIETARIOS, REGLAS_PROPIETARIOS } = require('./config');

// Direcciones con formato "Edificio - Calle 1234 U601" y mismo nombre para el mismo apto.
function asegurarDirecciones(force) {
  if (!force && ctx.store.obtenerAjustes().addressVersion === VERSION_DIRECCIONES) return 0;
  const lista = ctx.store.listarContratos().map(c => {
    const a = normalizarDireccion(c.direccionOriginal || c.direccion, REGLAS_DIRECCIONES);
    return { id: c.id, edificio: a.edificio, calle: a.calle, unidad: a.unidad, direccion: a.direccion };
  });
  if (lista.length) {
    ctx.store.respaldar('pre-direcciones');
    ctx.store.aplicarDirecciones(lista);
    ctx.store.ponerNombresInquilinos(ctx.store.listarContratos().map(c => ({ id: c.id, inquilino: D.mayusculasIniciales(c.inquilino) })));
  }
  ctx.store.guardarAjuste('addressVersion', VERSION_DIRECCIONES);
  return lista.length;
}

// Propietarios/contactos a partir del texto de los contratos (una vez por version de reglas).
function asegurarPropietarios(force) {
  if (!force && ctx.store.obtenerAjustes().ownersVersion === VERSION_PROPIETARIOS) return null;
  ctx.store.respaldar('pre-propietarios');
  const plan = planUnificarPropietarios(ctx.store.listarContratos(), REGLAS_PROPIETARIOS);
  plan.owners.forEach(o => { o.nombre = D.mayusculasIniciales(o.nombre); });
  plan.contacts.forEach(c => { c.nombre = D.mayusculasIniciales(c.nombre); });
  const res = ctx.store.aplicarPlanPropietarios(plan);
  ctx.store.guardarAjuste('ownersVersion', VERSION_PROPIETARIOS);
  ctx.store.guardarAjuste('ownersReview', JSON.stringify(plan.review));
  return res;
}

// Inactivos sin ningun contacto del propietario: se eliminan (pedido del usuario).
function asegurarLimpieza(force) {
  if (!force && ctx.store.obtenerAjustes().cleanupVersion === VERSION_LIMPIEZA) return [];
  ctx.store.respaldar('pre-limpieza');
  const borrados = ctx.store.purgarInactivosSinContacto();
  ctx.store.guardarAjuste('cleanupVersion', VERSION_LIMPIEZA);
  ctx.store.guardarAjuste('cleanupBorrados', JSON.stringify(borrados));
  return borrados;
}

function asegurarGarantias(force) {
  if (!force && ctx.store.obtenerAjustes().garantiaVersion === VERSION_GARANTIAS) return;
  ctx.store.respaldar('pre-garantias');
  ctx.store.migrarGarantias(D.mayusculasIniciales);
  ctx.store.guardarAjuste('garantiaVersion', VERSION_GARANTIAS);
}

function asegurarMoneda(force) {
  if (!force && ctx.store.obtenerAjustes().monedaVersion === VERSION_MONEDA) return;
  ctx.store.respaldar('pre-moneda');
  ctx.store.migrarMoneda();
  ctx.store.guardarAjuste('monedaVersion', VERSION_MONEDA);
}

// heuristicas: ajustes pensados para la planilla clasica (sin columna de moneda, con contratos
// viejos sin datos). Con la planilla modelo o los datos de ejemplo no hacen falta.
function asegurarDatos(force, { heuristicas = true } = {}) {
  asegurarDirecciones(force);
  asegurarPropietarios(force);
  if (heuristicas) asegurarLimpieza(force); else ctx.store.guardarAjuste('cleanupVersion', VERSION_LIMPIEZA);
  asegurarGarantias(force);
  if (heuristicas) asegurarMoneda(force); else ctx.store.guardarAjuste('monedaVersion', VERSION_MONEDA);
}

Object.assign(module.exports, { asegurarDatos });
