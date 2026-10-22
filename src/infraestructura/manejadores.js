// Canales entre la pantalla y el proceso principal (editor y Visor).
const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fetchLatestIPC } = require('./ine-ipc');
const D = require('../dominios/index.js');
const { nameKey } = D;
const { ctx } = require('./contexto');
const { ADDRESS_VERSION, CLEANUP_VERSION, DEFAULT_SHARED_DIR, GARANTIA_VERSION, MONEDA_VERSION, OWNERS_VERSION, defaultExcelPaths } = require('./config');
const { exportCsv } = require('./csv');
const { docFile, docPreview, pickOwnerDocs } = require('./documentos');
const estadoApp = require('./estado-app');
const { cleanContract } = require('./migraciones');
const publicacion = require('./publicacion');
const visor = require('./visor');
const ventana = require('./ventana');

// Cambios que se pueden deshacer (con el texto que se muestra en "Deshacer: ...").
const UNDO_LABELS = {
  'contract:add': 'Agregar alquiler', 'contract:update': 'Editar alquiler', 'contract:patch': 'Modificar alquiler',
  'contract:inactivate': 'Marcar inactivo', 'admin:save': 'Guardar administracion', 'admin:delete': 'Eliminar administracion',
  'marks:save': 'Cambiar marca', 'owner:save': 'Guardar propietario', 'owner:delete': 'Eliminar propietario',
  'owner:merge': 'Unificar propietarios', 'owner:account': 'Cuenta de cobro', 'owner:addDocs': 'Agregar documento',
  'owner:deleteDoc': 'Eliminar documento', 'contract:setOwners': 'Cambiar propietarios', 'import:liveDb': 'Copiar datos',
  'import:pick': 'Importar Excel', 'import:fromPath': 'Importar Excel', 'config:save': 'Cambiar configuración',
};

function notifyUndo() {
  if (ctx.win && !ctx.win.isDestroyed()) {
    ctx.win.webContents.send('undo:changed', ctx.store.undoStatus());
    ctx.win.webContents.send('save:changed', ctx.store.saveStatus);
  }
}

// Envuelve cada handler para devolver {ok, data} / {ok:false, error} al renderer.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_evt, ...args) => {
    const label = UNDO_LABELS[channel];
    const pushed = label && ctx.store ? ctx.store.checkpoint(label) : false;
    try {
      const data = await fn(...args);
      if (label) notifyUndo();
      return { ok: true, data };
    } catch (e) {
      if (pushed) ctx.store.dropCheckpoint();
      if (label) notifyUndo();
      console.error(`[${channel}]`, e);
      return { ok: false, error: e.message || String(e) };
    }
  });
}

function registerHandlers() {
  handle('state:get', () => estadoApp.state());

  handle('import:pick', async () => {
    const defaultPath = defaultExcelPaths().find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
    const res = await dialog.showOpenDialog(ctx.win, {
      title: 'Seleccionar planilla de Excel',
      defaultPath,
      filters: [{ name: 'Excel', extensions: ['xlsm', 'xlsx', 'xls'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return { counts: estadoApp.importFrom(res.filePaths[0]), state: estadoApp.state() };
  });

  handle('import:fromPath', (filePath) => {
    if (typeof filePath !== 'string' || !/\.(xlsm|xlsx|xls)$/i.test(filePath)) throw new Error('Archivo no valido.');
    return { counts: estadoApp.importFrom(filePath), state: estadoApp.state() };
  });

  handle('import:liveDb', () => estadoApp.importLiveDb());
  handle('start:empty', () => {
    ctx.store.setSetting('initialized', '1');
    ctx.store.setSetting('ownersVersion', OWNERS_VERSION);
    ctx.store.setSetting('addressVersion', ADDRESS_VERSION);
    ctx.store.setSetting('cleanupVersion', CLEANUP_VERSION);
    ctx.store.setSetting('garantiaVersion', GARANTIA_VERSION);
    ctx.store.setSetting('monedaVersion', MONEDA_VERSION);
    return estadoApp.state();
  });

  handle('undo:undo',   () => { const label = ctx.store.undo(); notifyUndo(); return { label, state: estadoApp.state() }; });
  handle('undo:redo',   () => { const label = ctx.store.redo(); notifyUndo(); return { label, state: estadoApp.state() }; });
  handle('undo:status', () => ctx.store.undoStatus());

  // Alta/edicion: ademas del contrato se vinculan los propietarios escritos en el modal.
  const saveWithOwners = (saved, c) => {
    if (c.propietario != null) ctx.store.linkOwnersFromText(saved.id, c.propietario, c.telProp, c.mailProp, nameKey);
    return { contract: saved, owners: ctx.store.listOwners(), contractOwners: ctx.store.listContractOwners() };
  };
  handle('contract:add',        (c)         => { const x = cleanContract(c); return saveWithOwners(ctx.store.addContract(x), x); });
  handle('contract:update',     (id, c)     => { const x = cleanContract(c); return saveWithOwners(ctx.store.updateContract(id, x), x); });
  handle('contract:patch',      (id, f)     => ctx.store.patchContract(id, f));
  handle('contract:inactivate', (id)        => ctx.store.setInactive(id));

  handle('admin:save',   (a)  => { ctx.store.saveAdmin(a); return ctx.store.listAdmins(); });
  handle('admin:delete', (id) => { ctx.store.deleteAdmin(id); return ctx.store.listAdmins(); });

  handle('marks:save',   (m)      => { ctx.store.replaceMarks(m); return true; });
  handle('setting:set',  (k, v)   => { ctx.store.setSetting(k, v); return true; });
  // Configuracion (marca y plantillas de mensajes): se valida todo antes de guardar nada.
  handle('config:save', ({ marca, mensajes } = {}) => {
    ctx.store.setSettings({ ...(marca ? D.marcaASettings(marca) : {}), ...(mensajes ? D.mensajesASettings(mensajes) : {}) });
    return { settings: ctx.store.getSettings() };
  });
  handle('window:titleBarColor', (c, ink) => ventana.setTitleBarColor(c, ink));
  handle('ipc:fetch',    ()       => fetchLatestIPC());

  const ownersState = () => ({
    owners: ctx.store.listOwners(), contacts: ctx.store.listContacts(), contractOwners: ctx.store.listContractOwners(),
    ownerDocs: ctx.store.listOwnerDocs(), ownerAccounts: ctx.store.listOwnerAccounts(),
  });
  // El propietario se guarda junto con su contacto (nuevo, existente editado o ninguno).
  handle('owner:save', (o) => {
    let contactId = null;
    const c = o.contact || { mode: 'none' };
    if (c.mode === 'new' || c.mode === 'existing') {
      contactId = ctx.store.saveContact({ id: c.mode === 'existing' ? c.id : null, nombre: D.titleCase(c.nombre), rol: c.rol,
        telefono: c.telefono, mail: c.mail, notas: c.notas });
    }
    ctx.store.saveOwner({ ...o, nombre: D.titleCase(o.nombre), contactId });
    return ownersState();
  });
  handle('owner:delete',   (id)                  => { ctx.store.deleteOwner(id); return ownersState(); });
  handle('owner:merge',    (keep, drop)          => { ctx.store.mergeOwners(keep, drop); return ownersState(); });
  handle('owner:account',  (ownerId, dir, cuenta) => { ctx.store.setOwnerAccount(ownerId, dir, cuenta); return ownersState(); });
  handle('owner:addDocs',  async (ownerId)       => { await pickOwnerDocs(ownerId); return ownersState(); });
  handle('owner:deleteDoc', (id)                 => { ctx.store.deleteOwnerDoc(id); return ownersState(); });
  handle('owner:docPreview', (id)                => docPreview(id));
  handle('owner:openDoc',  (id)                  => shell.openPath(docFile(id).p));
  handle('contract:setOwners', (id, ids)         => { ctx.store.setContractOwners(id, ids); return ownersState(); });

  handle('data:openFolder', () => shell.openPath(app.getPath('userData')));
  handle('data:backup',     () => ctx.store.backup('manual'));
  handle('data:exportCsv',  () => exportCsv());

  // Carpeta compartida para el Visor.
  handle('share:status',  () => publicacion.shareStatus());
  handle('share:publish', () => { publicacion.publishNow(); return publicacion.shareStatus(); });
  handle('share:pick', async () => {
    const res = await dialog.showOpenDialog(ctx.win, {
      title: 'Carpeta compartida para el Visor', properties: ['openDirectory', 'createDirectory'],
      defaultPath: DEFAULT_SHARED_DIR && fs.existsSync(path.dirname(DEFAULT_SHARED_DIR)) ? path.dirname(DEFAULT_SHARED_DIR) : undefined,
    });
    if (res.canceled || !res.filePaths[0]) return publicacion.shareStatus();
    ctx.store.setSetting('sharedDir', res.filePaths[0]);
    publicacion.publishNow();
    return publicacion.shareStatus();
  });
  handle('share:disable', () => { ctx.store.setSetting('sharedDir', '-'); publicacion.publishNow(); return publicacion.shareStatus(); });
}

// El Visor solo lee: no se registra ningun canal que modifique datos.
function registerViewerHandlers() {
  handle('state:get',        () => estadoApp.state());
  handle('viewer:pickDir',   () => visor.pickViewerDir());
  handle('viewer:reload',    async () => { await visor.loadViewer(); return estadoApp.state(); });
  handle('ipc:fetch',        () => fetchLatestIPC());
  handle('owner:docPreview', (id) => docPreview(id));
  handle('owner:openDoc',    (id) => shell.openPath(docFile(id).p));
  handle('data:exportCsv',   () => exportCsv());
  handle('setting:set',      () => true);
  handle('window:titleBarColor', (c, ink) => ventana.setTitleBarColor(c, ink));
  handle('undo:status',      () => ctx.store ? ctx.store.undoStatus() : {});
}

Object.assign(module.exports, { UNDO_LABELS, notifyUndo, handle, registerHandlers, registerViewerHandlers });
