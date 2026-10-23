// Canales entre la pantalla y el proceso principal (editor y Visor).
const { app, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { consultarUltimoIPC } = require('./ine-ipc');
const D = require('../dominios/index.js');
const { claveNombre } = D;
const { ctx } = require('./contexto');
const { VERSION_DIRECCIONES, VERSION_LIMPIEZA, CARPETA_COMPARTIDA_PREDETERMINADA, VERSION_GARANTIAS, VERSION_MONEDA, VERSION_PROPIETARIOS, rutasExcelPredeterminadas } = require('./config');
const { exportarCsv } = require('./csv');
const { archivoDoc, vistaPreviaDoc, elegirDocsPropietario } = require('./documentos');
const estadoApp = require('./estado-app');
const { escribirModelo } = require('./importador-excel');
const publicacion = require('./publicacion');
const visor = require('./visor');
const ventana = require('./ventana');

// Cambios que se pueden deshacer (con el texto que se muestra en "Deshacer: ...").
const ETIQUETAS_DESHACER = {
  'contract:add': 'Agregar alquiler', 'contract:update': 'Editar alquiler', 'contract:patch': 'Modificar alquiler',
  'contract:inactivate': 'Marcar inactivo', 'admin:save': 'Guardar administracion', 'admin:delete': 'Eliminar administracion',
  'marks:save': 'Cambiar marca', 'owner:save': 'Guardar propietario', 'owner:delete': 'Eliminar propietario',
  'owner:merge': 'Unificar propietarios', 'owner:account': 'Cuenta de cobro', 'owner:addDocs': 'Agregar documento',
  'owner:deleteDoc': 'Eliminar documento', 'contract:setOwners': 'Cambiar propietarios',
  'import:demo': 'Cargar datos de ejemplo', 'import:pick': 'Importar Excel', 'import:fromPath': 'Importar Excel', 'import:add': 'Agregar planilla', 'import:replace': 'Reemplazar con planilla', 'config:save': 'Cambiar configuración',
};

const EXTENSIONES_PLANILLA = ['xlsx', 'xlsm', 'xls', 'csv'];

// Cambios grandes: siempre un paso propio de deshacer (no se agrupan con el anterior).
const UNDO_SEPARADOS = new Set(['import:demo', 'import:pick', 'import:fromPath', 'import:add', 'import:replace']);

function avisarDeshacer() {
  if (ctx.win && !ctx.win.isDestroyed()) {
    ctx.win.webContents.send('undo:changed', ctx.store.estadoDeshacer());
    ctx.win.webContents.send('save:changed', ctx.store.saveStatus);
  }
}

// Envuelve cada handler para devolver {ok, data} / {ok:false, error} al renderer.
function manejar(channel, fn) {
  ipcMain.handle(channel, async (_evt, ...args) => {
    const label = ETIQUETAS_DESHACER[channel];
    const pushed = label && ctx.store ? ctx.store.puntoDeControl(label, !UNDO_SEPARADOS.has(channel)) : false;
    try {
      const data = await fn(...args);
      if (data === null && pushed) ctx.store.descartarPuntoDeControl();       // dialogo cancelado: no hubo cambio
      if (label) avisarDeshacer();
      return { ok: true, data };
    } catch (e) {
      if (pushed) ctx.store.descartarPuntoDeControl();
      if (label) avisarDeshacer();
      console.error(`[${channel}]`, e);
      return { ok: false, error: e.message || String(e) };
    }
  });
}

// Canales que no modifican datos: los usan el editor y el Visor.
function registrarManejadoresComunes() {
  manejar('state:get',            () => estadoApp.state());
  manejar('undo:status',          () => (ctx.store ? ctx.store.estadoDeshacer() : {}));
  // En las pruebas (ADMIN_ALQ_NO_EXTERNAL) no se consulta al INE: el resultado no depende de internet.
  manejar('ipc:fetch',            () => (process.env.ADMIN_ALQ_NO_EXTERNAL ? { ok: false, error: 'Consulta al INE desactivada en las pruebas.' } : consultarUltimoIPC()));
  manejar('owner:docPreview',     (id) => vistaPreviaDoc(id));
  manejar('owner:openDoc',        (id) => shell.openPath(archivoDoc(id).p));
  manejar('data:exportCsv',       () => exportarCsv());
  manejar('window:titleBarColor', (c, ink) => ventana.ponerColorBarraTitulo(c, ink));
  manejar('window:icon',          (png) => ventana.ponerIconoApp(png));
  manejar('window:zoom',          (f) => ventana.ponerZoom(f));
}

function registrarManejadores() {
  registrarManejadoresComunes();

  // Planillas: elegir el archivo y reemplazar todo (al empezar o con la app en uso), o sumarla a
  // lo que ya hay. null = se cancelo el dialogo.
  const elegirPlanilla = async () => {
    const defaultPath = rutasExcelPredeterminadas().find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
    const res = await dialog.showOpenDialog(ctx.win, {
      title: 'Seleccionar planilla de alquileres', defaultPath, properties: ['openFile'],
      filters: [{ name: 'Planillas', extensions: EXTENSIONES_PLANILLA }],
    });
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
  };
  const reemplazarCon = file => (file ? { counts: estadoApp.importarDesde(file), state: estadoApp.state() } : null);

  manejar('import:pick',     async () => reemplazarCon(await elegirPlanilla()));
  manejar('import:replace',  async () => reemplazarCon(await elegirPlanilla()));
  manejar('import:fromPath', (filePath) => {
    const ext = typeof filePath === 'string' && path.extname(filePath).slice(1).toLowerCase();
    if (!EXTENSIONES_PLANILLA.includes(ext)) throw new Error('Archivo no valido.');
    return reemplazarCon(filePath);
  });
  manejar('import:add', async () => {
    const file = await elegirPlanilla();
    return file ? { result: estadoApp.agregarDesde(file), state: estadoApp.state() } : null;
  });
  manejar('import:demo', () => estadoApp.cargarDemo());
  manejar('import:template', async () => {
    const res = await dialog.showSaveDialog(ctx.win, {
      title: 'Guardar planilla modelo', defaultPath: path.join(app.getPath('documents'), 'planilla-alquileres.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (res.canceled || !res.filePath) return null;
    escribirModelo(res.filePath);
    shell.showItemInFolder(res.filePath);
    return res.filePath;
  });
  manejar('start:empty', () => {
    ctx.store.guardarAjuste('initialized', '1');
    ctx.store.guardarAjuste('ownersVersion', VERSION_PROPIETARIOS);
    ctx.store.guardarAjuste('addressVersion', VERSION_DIRECCIONES);
    ctx.store.guardarAjuste('cleanupVersion', VERSION_LIMPIEZA);
    ctx.store.guardarAjuste('garantiaVersion', VERSION_GARANTIAS);
    ctx.store.guardarAjuste('monedaVersion', VERSION_MONEDA);
    return estadoApp.state();
  });

  manejar('undo:undo',   () => { const label = ctx.store.deshacerCambio(); avisarDeshacer(); return { label, state: estadoApp.state() }; });
  manejar('undo:redo',   () => { const label = ctx.store.rehacerCambio(); avisarDeshacer(); return { label, state: estadoApp.state() }; });

  // Alta/edicion: ademas del contrato se vinculan los propietarios escritos en el modal.
  const saveWithOwners = (saved, c) => {
    if (c.propietario != null) ctx.store.vincularPropietariosDesdeTexto(saved.id, c.propietario, c.telProp, c.mailProp, claveNombre);
    return { contract: saved, owners: ctx.store.listarPropietarios(), contractOwners: ctx.store.listarPropietariosDeContratos() };
  };
  manejar('contract:add',        (c)         => { const x = D.normalizarContrato(c); return saveWithOwners(ctx.store.agregarContrato(x), x); });
  manejar('contract:update',     (id, c)     => { const x = D.normalizarContrato(c); return saveWithOwners(ctx.store.editarContrato(id, x), x); });
  manejar('contract:patch',      (id, f)     => ctx.store.modificarContrato(id, f));
  manejar('contract:inactivate', (id)        => ctx.store.marcarInactivo(id));

  manejar('admin:save',   (a)  => { ctx.store.guardarAdmin(a); return ctx.store.listarAdmins(); });
  manejar('admin:delete', (id) => { ctx.store.borrarAdmin(id); return ctx.store.listarAdmins(); });

  manejar('marks:save',   (m)      => { ctx.store.reemplazarMarcas(m); return true; });
  manejar('setting:set',  (k, v)   => { ctx.store.guardarAjuste(k, v); return true; });
  // Configuracion (marca y plantillas de mensajes): se valida todo antes de guardar nada.
  manejar('config:save', ({ marca, mensajes, asistente } = {}) => {
    ctx.store.guardarAjustes({ ...(marca ? D.marcaASettings(marca) : {}), ...(mensajes ? D.mensajesASettings(mensajes) : {}),
      ...(asistente ? { asistenteVisto: '1' } : {}) });
    return { settings: ctx.store.obtenerAjustes() };
  });

  const ownersState = () => ({
    owners: ctx.store.listarPropietarios(), contacts: ctx.store.listarContactos(), contractOwners: ctx.store.listarPropietariosDeContratos(),
    ownerDocs: ctx.store.listarDocsPropietarios(), ownerAccounts: ctx.store.listarCuentasPropietarios(),
  });
  // El propietario se guarda junto con su contacto (nuevo, existente editado o ninguno).
  manejar('owner:save', (o) => {
    let contactId = null;
    const c = o.contact || { mode: 'none' };
    if (c.mode === 'new' || c.mode === 'existing') {
      contactId = ctx.store.guardarContacto({ id: c.mode === 'existing' ? c.id : null, nombre: D.mayusculasIniciales(c.nombre), rol: c.rol,
        telefono: c.telefono, mail: c.mail, notas: c.notas });
    }
    ctx.store.guardarPropietario({ ...o, nombre: D.mayusculasIniciales(o.nombre), contactId });
    return ownersState();
  });
  manejar('owner:delete',   (id)                  => { ctx.store.borrarPropietario(id); return ownersState(); });
  manejar('owner:merge',    (keep, drop)          => { ctx.store.unificarPropietarios(keep, drop); return ownersState(); });
  manejar('owner:account',  (ownerId, dir, cuenta) => { ctx.store.ponerCuentaPropietario(ownerId, dir, cuenta); return ownersState(); });
  manejar('owner:addDocs',  async (ownerId)       => { await elegirDocsPropietario(ownerId); return ownersState(); });
  manejar('owner:deleteDoc', (id)                 => { ctx.store.borrarDocPropietario(id); return ownersState(); });
  manejar('contract:setOwners', (id, ids)         => { ctx.store.asignarPropietariosContrato(id, ids); return ownersState(); });

  manejar('data:openFolder', () => shell.openPath(app.getPath('userData')));
  manejar('data:backup',     () => ctx.store.respaldar('manual'));

  // Carpeta compartida para el Visor.
  manejar('share:status',  () => publicacion.estadoCompartir());
  manejar('share:publish', () => { publicacion.publicarAhora(); return publicacion.estadoCompartir(); });
  manejar('share:pick', async () => {
    const res = await dialog.showOpenDialog(ctx.win, {
      title: 'Carpeta compartida para el Visor', properties: ['openDirectory', 'createDirectory'],
      defaultPath: CARPETA_COMPARTIDA_PREDETERMINADA && fs.existsSync(path.dirname(CARPETA_COMPARTIDA_PREDETERMINADA)) ? path.dirname(CARPETA_COMPARTIDA_PREDETERMINADA) : undefined,
    });
    if (res.canceled || !res.filePaths[0]) return publicacion.estadoCompartir();
    ctx.store.guardarAjuste('sharedDir', res.filePaths[0]);
    publicacion.publicarAhora();
    return publicacion.estadoCompartir();
  });
  manejar('share:disable', () => { ctx.store.guardarAjuste('sharedDir', '-'); publicacion.publicarAhora(); return publicacion.estadoCompartir(); });
}

// El Visor solo lee: no se registra ningun canal que modifique datos.
function registrarManejadoresVisor() {
  registrarManejadoresComunes();
  manejar('viewer:pickDir', () => visor.elegirCarpetaVisor());
  manejar('viewer:reload',  async () => { await visor.cargarVisor(); return estadoApp.state(); });
  manejar('setting:set',    () => true);
}

Object.assign(module.exports, { registrarManejadores, registrarManejadoresVisor });
