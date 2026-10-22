// Estado que se manda a la pantalla; abrir la base e importar datos.
const fs = require('fs');
const { Store } = require('./base-datos');
const { readWorkbookFile } = require('./importador-excel');
const share = require('./compartir');
const { ctx } = require('./contexto');
const { IS_VIEWER, MODE } = require('./config');
const { ensureData } = require('./migraciones');
const publicacion = require('./publicacion');
const { dbPath, liveDbAvailable, liveDbPath } = require('./rutas');
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
    liveDbAvailable: !IS_VIEWER && liveDbAvailable(),
    dbPath:    dbPath(),
  };
}

function importFrom(filePath) {
  const data = readWorkbookFile(filePath);
  if (!data.contracts.length) throw new Error('No se encontraron alquileres en la hoja ALQUILADOS.');
  ctx.store.backup('pre-import');
  const counts = ctx.store.importData(data);
  ensureData(true);
  ctx.store.setSetting('initialized', '1');
  ctx.store.setSetting('importedFrom', filePath);
  ctx.store.setSetting('importedAt', new Date().toISOString());
  return counts;
}

async function openStore() {
  ctx.store = await Store.open(dbPath());
  ensureData(false);
  publicacion.attachSharing();
}

// Copia la base de la version estable (incluye marcas) y la migra.
async function importLiveDb() {
  if (!liveDbAvailable()) throw new Error('No se encontro la base de la app instalada.');
  ctx.store.backup('pre-copia');
  ctx.store.close();
  fs.copyFileSync(liveDbPath(), dbPath());
  ctx.store = await Store.open(dbPath());
  publicacion.attachSharing();
  ensureData(true);
  ctx.store.setSetting('initialized', '1');
  ctx.store.setSetting('importedFrom', liveDbPath());
  return { counts: { contracts: ctx.store.listContracts().length, admins: ctx.store.listAdmins().length }, state: state() };
}

Object.assign(module.exports, { state, importFrom, openStore, importLiveDb });
