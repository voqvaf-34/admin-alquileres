// Normalizacion de datos (direcciones, propietarios, limpieza, garantias, moneda), una vez por version.
const D = require('../dominios/index.js');
const { normalizarDireccion, planUnificarPropietarios } = require('../dominios/index.js');
const { ctx } = require('./contexto');
const { REGLAS_DIRECCIONES, VERSION_DIRECCIONES, VERSION_LIMPIEZA, VERSION_GARANTIAS, VERSION_MONEDA, VERSION_PROPIETARIOS, REGLAS_PROPIETARIOS } = require('./config');

// Direcciones con formato "Edificio - Calle 1234 U601" y mismo nombre para el mismo apto.
function asegurarDirecciones(force) {
  if (!force && ctx.base.obtenerAjustes().versionDirecciones === VERSION_DIRECCIONES) return 0;
  const lista = ctx.base.listarContratos().map(c => {
    const a = normalizarDireccion(c.direccionOriginal || c.direccion, REGLAS_DIRECCIONES);
    return { id: c.id, edificio: a.edificio, calle: a.calle, unidad: a.unidad, direccion: a.direccion };
  });
  if (lista.length) {
    ctx.base.respaldar('pre-direcciones');
    ctx.base.aplicarDirecciones(lista);
    ctx.base.ponerNombresInquilinos(ctx.base.listarContratos().map(c => ({ id: c.id, inquilino: D.mayusculasIniciales(c.inquilino) })));
  }
  ctx.base.guardarAjuste('versionDirecciones', VERSION_DIRECCIONES);
  return lista.length;
}

// Propietarios/contactos a partir del texto de los contratos (una vez por version de reglas).
function asegurarPropietarios(force) {
  if (!force && ctx.base.obtenerAjustes().versionPropietarios === VERSION_PROPIETARIOS) return null;
  ctx.base.respaldar('pre-propietarios');
  const plan = planUnificarPropietarios(ctx.base.listarContratos(), REGLAS_PROPIETARIOS);
  plan.propietarios.forEach(o => { o.nombre = D.mayusculasIniciales(o.nombre); });
  plan.contactos.forEach(c => { c.nombre = D.mayusculasIniciales(c.nombre); });
  const res = ctx.base.aplicarPlanPropietarios(plan);
  ctx.base.guardarAjuste('versionPropietarios', VERSION_PROPIETARIOS);
  ctx.base.guardarAjuste('revisionPropietarios', JSON.stringify(plan.revision));
  return res;
}

// Inactivos sin ningun contacto del propietario: se eliminan (pedido del usuario).
function asegurarLimpieza(force) {
  if (!force && ctx.base.obtenerAjustes().versionLimpieza === VERSION_LIMPIEZA) return [];
  ctx.base.respaldar('pre-limpieza');
  const borrados = ctx.base.purgarInactivosSinContacto();
  ctx.base.guardarAjuste('versionLimpieza', VERSION_LIMPIEZA);
  ctx.base.guardarAjuste('limpiezaBorrados', JSON.stringify(borrados));
  return borrados;
}

function asegurarGarantias(force) {
  if (!force && ctx.base.obtenerAjustes().versionGarantias === VERSION_GARANTIAS) return;
  ctx.base.respaldar('pre-garantias');
  ctx.base.migrarGarantias(D.mayusculasIniciales);
  ctx.base.guardarAjuste('versionGarantias', VERSION_GARANTIAS);
}

function asegurarMoneda(force) {
  if (!force && ctx.base.obtenerAjustes().versionMoneda === VERSION_MONEDA) return;
  ctx.base.respaldar('pre-moneda');
  ctx.base.migrarMoneda();
  ctx.base.guardarAjuste('versionMoneda', VERSION_MONEDA);
}

// heuristicas: ajustes pensados para la planilla clasica (sin columna de moneda, con contratos
// viejos sin datos). Con la planilla modelo o los datos de ejemplo no hacen falta.
function asegurarDatos(force, { heuristicas = true } = {}) {
  asegurarDirecciones(force);
  asegurarPropietarios(force);
  if (heuristicas) asegurarLimpieza(force); else ctx.base.guardarAjuste('versionLimpieza', VERSION_LIMPIEZA);
  asegurarGarantias(force);
  if (heuristicas) asegurarMoneda(force); else ctx.base.guardarAjuste('versionMoneda', VERSION_MONEDA);
}

Object.assign(module.exports, { asegurarDatos });
