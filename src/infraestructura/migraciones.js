// Normalizacion de datos (direcciones, propietarios, limpieza, garantias, moneda), una vez por version.
const D = require('../dominios/index.js');
const { normalizeAddress, unifyOwners } = require('../dominios/index.js');
const { ctx } = require('./contexto');
const { ADDRESS_RULES, ADDRESS_VERSION, CLEANUP_VERSION, GARANTIA_VERSION, MONEDA_VERSION, OWNERS_VERSION, OWNER_RULES } = require('./config');

// Direcciones con formato "Edificio - Calle 1234 U601" y mismo nombre para el mismo apto.
function ensureAddresses(force) {
  if (!force && ctx.store.getSettings().addressVersion === ADDRESS_VERSION) return 0;
  const list = ctx.store.listContracts().map(c => {
    const a = normalizeAddress(c.direccionOriginal || c.direccion, ADDRESS_RULES);
    return { id: c.id, edificio: a.edificio, calle: a.calle, unidad: a.unidad, direccion: a.direccion };
  });
  if (list.length) {
    ctx.store.backup('pre-direcciones');
    ctx.store.applyAddresses(list);
    ctx.store.setTenantNames(ctx.store.listContracts().map(c => ({ id: c.id, inquilino: D.titleCase(c.inquilino) })));
  }
  ctx.store.setSetting('addressVersion', ADDRESS_VERSION);
  return list.length;
}

// Propietarios/contactos a partir del texto de los contratos (una vez por version de reglas).
function ensureOwners(force) {
  if (!force && ctx.store.getSettings().ownersVersion === OWNERS_VERSION) return null;
  ctx.store.backup('pre-propietarios');
  const plan = unifyOwners(ctx.store.listContracts(), OWNER_RULES);
  plan.owners.forEach(o => { o.nombre = D.titleCase(o.nombre); });
  plan.contacts.forEach(c => { c.nombre = D.titleCase(c.nombre); });
  const res = ctx.store.applyOwnersPlan(plan);
  ctx.store.setSetting('ownersVersion', OWNERS_VERSION);
  ctx.store.setSetting('ownersReview', JSON.stringify(plan.review));
  return res;
}

// Inactivos sin ningun contacto del propietario: se eliminan (pedido del usuario).
function ensureCleanup(force) {
  if (!force && ctx.store.getSettings().cleanupVersion === CLEANUP_VERSION) return [];
  ctx.store.backup('pre-limpieza');
  const borrados = ctx.store.purgeInactiveWithoutContact();
  ctx.store.setSetting('cleanupVersion', CLEANUP_VERSION);
  ctx.store.setSetting('cleanupBorrados', JSON.stringify(borrados));
  return borrados;
}

function ensureGarantias(force) {
  if (!force && ctx.store.getSettings().garantiaVersion === GARANTIA_VERSION) return;
  ctx.store.backup('pre-garantias');
  ctx.store.migrateGarantias(D.titleCase);
  ctx.store.setSetting('garantiaVersion', GARANTIA_VERSION);
}

function ensureMoneda(force) {
  if (!force && ctx.store.getSettings().monedaVersion === MONEDA_VERSION) return;
  ctx.store.backup('pre-moneda');
  ctx.store.migrateMoneda();
  ctx.store.setSetting('monedaVersion', MONEDA_VERSION);
}

// heuristicas: ajustes pensados para la planilla clasica (sin columna de moneda, con contratos
// viejos sin datos). Con la planilla modelo o los datos de ejemplo no hacen falta.
function ensureData(force, { heuristicas = true } = {}) {
  ensureAddresses(force);
  ensureOwners(force);
  if (heuristicas) ensureCleanup(force); else ctx.store.setSetting('cleanupVersion', CLEANUP_VERSION);
  ensureGarantias(force);
  if (heuristicas) ensureMoneda(force); else ctx.store.setSetting('monedaVersion', MONEDA_VERSION);
}

Object.assign(module.exports, { ensureAddresses, ensureOwners, ensureCleanup, ensureGarantias, ensureMoneda, ensureData });
