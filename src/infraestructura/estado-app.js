// Estado que se manda a la pantalla; abrir la base e importar datos.
const D = require('../dominios/index.js');
const { Store } = require('./base-datos');
const { readWorkbookFile } = require('./importador-excel');
const { ctx } = require('./contexto');
const { ADDRESS_RULES, IS_VIEWER, MODE } = require('./config');
const { ensureData } = require('./migraciones');
const publicacion = require('./publicacion');
const { dbPath } = require('./rutas');
const visor = require('./visor');

function state() {
  if (IS_VIEWER && !ctx.store) return { mode: MODE, needsShared: true, viewer: visor.viewerStatus() };
  return {
    mode:      MODE,
    share:     IS_VIEWER ? null : publicacion.shareStatus(),
    save:      IS_VIEWER ? null : ctx.store.saveStatus,
    viewer:    IS_VIEWER ? visor.viewerStatus() : null,
    contracts: ctx.store.listContracts(),
    admins:    ctx.store.listAdmins(),
    owners:    ctx.store.listOwners(),
    contacts:  ctx.store.listContacts(),
    contractOwners: ctx.store.listContractOwners(),
    ownerDocs: ctx.store.listOwnerDocs(),
    ownerAccounts: ctx.store.listOwnerAccounts(),
    marks:     ctx.store.getMarks(),
    settings:  ctx.store.getSettings(),
    undo:      ctx.store.undoStatus(),
    needsImport: !IS_VIEWER && ctx.store.isEmpty() && ctx.store.getSettings().initialized !== '1',
    // Asistente de primer uso (marca y apariencia). ADMIN_ALQ_SIN_ASISTENTE lo saltea (pruebas).
    asistente: !IS_VIEWER && ctx.store.isEmpty() && !ctx.store.getSettings().asistenteVisto && !process.env.ADMIN_ALQ_SIN_ASISTENTE,
    dbPath:    dbPath(),
  };
}

function importFrom(filePath) {
  const data = readWorkbookFile(filePath);
  if (!data.contracts.length) throw new Error('No se encontraron alquileres. Usá la planilla modelo: hacen falta al menos las columnas "Dirección" y "Alquiler actual".');
  ctx.store.backup('pre-import');
  const counts = ctx.store.importData(data);
  ensureData(true, { heuristicas: data.formato === 'clasico' });
  ctx.store.setSetting('initialized', '1');
  ctx.store.setSetting('importedFrom', filePath);
  ctx.store.setSetting('importedAt', new Date().toISOString());
  return counts;
}

// Suma una planilla a lo que ya hay (con la app en uso): no toca lo cargado y saltea repetidos.
function addFrom(filePath) {
  const data = readWorkbookFile(filePath);
  if (!data.contracts.length) throw new Error('No se encontraron alquileres. Usá la planilla modelo: hacen falta al menos las columnas "Dirección" y "Alquiler actual".');
  const clasico = data.formato === 'clasico';
  ctx.store.backup('pre-agregar');
  const res = ctx.store.addImported({ contracts: data.contracts.map(c => D.prepararImportado(c, { reglasDirecciones: ADDRESS_RULES, clasico })), admins: data.admins }, D.nameKey);
  ctx.store.setSetting('initialized', '1');
  return res;
}

// Datos de ejemplo inventados (ver dominios/demo.js): pasan por las mismas normalizaciones que
// una importacion.
function loadDemo() {
  const { contracts, admins, marks } = D.datosDemo(new Date());
  ctx.store.backup('pre-ejemplo');
  const counts = ctx.store.importData({ contracts, admins });
  ensureData(true, { heuristicas: false });
  ctx.store.replaceMarks(marks);
  ctx.store.setSetting('initialized', '1');
  ctx.store.setSetting('importedFrom', 'datos de ejemplo');
  ctx.store.setSetting('importedAt', new Date().toISOString());
  return { counts, state: state() };
}

async function openStore() {
  ctx.store = await Store.open(dbPath());
  ensureData(false);
  publicacion.attachSharing();
}

Object.assign(module.exports, { state, importFrom, addFrom, loadDemo, openStore });
