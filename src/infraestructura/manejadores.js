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
  if (ctx.ventana && !ctx.ventana.isDestroyed()) {
    ctx.ventana.webContents.send('undo:changed', ctx.base.estadoDeshacer());
    ctx.ventana.webContents.send('save:changed', ctx.base.estadoGuardado);
  }
}

// Envuelve cada handler para devolver {ok, data} / {ok:false, error} al renderer.
function manejar(canal, fn) {
  ipcMain.handle(canal, async (_evt, ...args) => {
    const etiqueta = ETIQUETAS_DESHACER[canal];
    const agregado = etiqueta && ctx.base ? ctx.base.puntoDeControl(etiqueta, !UNDO_SEPARADOS.has(canal)) : false;
    try {
      const datos = await fn(...args);
      if (datos === null && agregado) ctx.base.descartarPuntoDeControl();       // dialogo cancelado: no hubo cambio
      if (etiqueta) avisarDeshacer();
      return { ok: true, datos };
    } catch (e) {
      if (agregado) ctx.base.descartarPuntoDeControl();
      if (etiqueta) avisarDeshacer();
      console.error(`[${canal}]`, e);
      return { ok: false, error: e.message || String(e) };
    }
  });
}

// Canales que no modifican datos: los usan el editor y el Visor.
function registrarManejadoresComunes() {
  manejar('state:get',            () => estadoApp.estado());
  manejar('undo:status',          () => (ctx.base ? ctx.base.estadoDeshacer() : {}));
  // En las pruebas (ADMIN_ALQ_NO_EXTERNAL) no se consulta al INE: el resultado no depende de internet.
  manejar('ipc:fetch',            () => (process.env.ADMIN_ALQ_NO_EXTERNAL ? { ok: false, error: 'Consulta al INE desactivada en las pruebas.' } : consultarUltimoIPC()));
  manejar('owner:docPreview',     (id) => vistaPreviaDoc(id));
  manejar('owner:openDoc',        (id) => shell.openPath(archivoDoc(id).p));
  manejar('data:exportCsv',       () => exportarCsv());
  manejar('window:titleBarColor', (c, tinta) => ventana.ponerColorBarraTitulo(c, tinta));
  manejar('window:icon',          (png) => ventana.ponerIconoApp(png));
  manejar('window:zoom',          (f) => ventana.ponerZoom(f));
}

function registrarManejadores() {
  registrarManejadoresComunes();

  // Planillas: elegir el archivo y reemplazar todo (al empezar o con la app en uso), o sumarla a
  // lo que ya hay. null = se cancelo el dialogo.
  const elegirPlanilla = async () => {
    const rutaPredeterminada = rutasExcelPredeterminadas().find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
    const res = await dialog.showOpenDialog(ctx.ventana, {
      title: 'Seleccionar planilla de alquileres', defaultPath: rutaPredeterminada, properties: ['openFile'],
      filters: [{ name: 'Planillas', extensions: EXTENSIONES_PLANILLA }],
    });
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
  };
  const reemplazarCon = archivo => (archivo ? { cantidades: estadoApp.importarDesde(archivo), estado: estadoApp.estado() } : null);

  manejar('import:pick',     async () => reemplazarCon(await elegirPlanilla()));
  manejar('import:replace',  async () => reemplazarCon(await elegirPlanilla()));
  manejar('import:fromPath', (rutaArchivo) => {
    const ext = typeof rutaArchivo === 'string' && path.extname(rutaArchivo).slice(1).toLowerCase();
    if (!EXTENSIONES_PLANILLA.includes(ext)) throw new Error('Archivo no valido.');
    return reemplazarCon(rutaArchivo);
  });
  manejar('import:add', async () => {
    const archivo = await elegirPlanilla();
    return archivo ? { resultado: estadoApp.agregarDesde(archivo), estado: estadoApp.estado() } : null;
  });
  manejar('import:demo', () => estadoApp.cargarDemo());
  manejar('import:template', async () => {
    const res = await dialog.showSaveDialog(ctx.ventana, {
      title: 'Guardar planilla modelo', defaultPath: path.join(app.getPath('documents'), 'planilla-alquileres.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (res.canceled || !res.rutaArchivo) return null;
    escribirModelo(res.rutaArchivo);
    shell.showItemInFolder(res.rutaArchivo);
    return res.rutaArchivo;
  });
  manejar('start:empty', () => {
    ctx.base.guardarAjuste('inicializada', '1');
    ctx.base.guardarAjuste('versionPropietarios', VERSION_PROPIETARIOS);
    ctx.base.guardarAjuste('versionDirecciones', VERSION_DIRECCIONES);
    ctx.base.guardarAjuste('versionLimpieza', VERSION_LIMPIEZA);
    ctx.base.guardarAjuste('versionGarantias', VERSION_GARANTIAS);
    ctx.base.guardarAjuste('versionMoneda', VERSION_MONEDA);
    return estadoApp.estado();
  });

  manejar('undo:undo',   () => { const etiqueta = ctx.base.deshacerCambio(); avisarDeshacer(); return { etiqueta, estado: estadoApp.estado() }; });
  manejar('undo:redo',   () => { const etiqueta = ctx.base.rehacerCambio(); avisarDeshacer(); return { etiqueta, estado: estadoApp.estado() }; });

  // Alta/edicion: ademas del contrato se vinculan los propietarios escritos en el modal.
  const guardarConPropietarios = (guardado, c) => {
    if (c.propietario != null) ctx.base.vincularPropietariosDesdeTexto(guardado.id, c.propietario, c.telProp, c.mailProp, claveNombre);
    return { contrato: guardado, propietarios: ctx.base.listarPropietarios(), contratosPropietarios: ctx.base.listarPropietariosDeContratos() };
  };
  manejar('contract:add',        (c)         => { const x = D.normalizarContrato(c); return guardarConPropietarios(ctx.base.agregarContrato(x), x); });
  manejar('contract:update',     (id, c)     => { const x = D.normalizarContrato(c); return guardarConPropietarios(ctx.base.editarContrato(id, x), x); });
  manejar('contract:patch',      (id, f)     => ctx.base.modificarContrato(id, f));
  manejar('contract:inactivate', (id)        => ctx.base.marcarInactivo(id));

  manejar('admin:save',   (a)  => { ctx.base.guardarAdmin(a); return ctx.base.listarAdmins(); });
  manejar('admin:delete', (id) => { ctx.base.borrarAdmin(id); return ctx.base.listarAdmins(); });

  manejar('marks:save',   (m)      => { ctx.base.reemplazarMarcas(m); return true; });
  manejar('setting:set',  (k, v)   => { ctx.base.guardarAjuste(k, v); return true; });
  // Configuracion (marca y plantillas de mensajes): se valida todo antes de guardar nada.
  manejar('config:save', ({ marca, mensajes, asistente } = {}) => {
    ctx.base.guardarAjustes({ ...(marca ? D.marcaASettings(marca) : {}), ...(mensajes ? D.mensajesASettings(mensajes) : {}),
      ...(asistente ? { asistenteVisto: '1' } : {}) });
    return { ajustes: ctx.base.obtenerAjustes() };
  });

  const estadoPropietarios = () => ({
    propietarios: ctx.base.listarPropietarios(), contactos: ctx.base.listarContactos(), contratosPropietarios: ctx.base.listarPropietariosDeContratos(),
    docsPropietarios: ctx.base.listarDocsPropietarios(), cuentasPropietarios: ctx.base.listarCuentasPropietarios(),
  });
  // El propietario se guarda junto con su contacto (nuevo, existente editado o ninguno).
  manejar('owner:save', (o) => {
    let idContacto = null;
    const c = o.contacto || { modo: 'none' };
    if (c.modo === 'new' || c.modo === 'existing') {
      idContacto = ctx.base.guardarContacto({ id: c.modo === 'existing' ? c.id : null, nombre: D.mayusculasIniciales(c.nombre), rol: c.rol,
        telefono: c.telefono, mail: c.mail, notas: c.notas });
    }
    ctx.base.guardarPropietario({ ...o, nombre: D.mayusculasIniciales(o.nombre), idContacto });
    return estadoPropietarios();
  });
  manejar('owner:delete',   (id)                  => { ctx.base.borrarPropietario(id); return estadoPropietarios(); });
  manejar('owner:merge',    (conservar, quitar)          => { ctx.base.unificarPropietarios(conservar, quitar); return estadoPropietarios(); });
  manejar('owner:account',  (idPropietario, dir, cuenta) => { ctx.base.ponerCuentaPropietario(idPropietario, dir, cuenta); return estadoPropietarios(); });
  manejar('owner:addDocs',  async (idPropietario)       => { await elegirDocsPropietario(idPropietario); return estadoPropietarios(); });
  manejar('owner:deleteDoc', (id)                 => { ctx.base.borrarDocPropietario(id); return estadoPropietarios(); });
  manejar('contract:setOwners', (id, ids)         => { ctx.base.asignarPropietariosContrato(id, ids); return estadoPropietarios(); });

  manejar('data:openFolder', () => shell.openPath(app.getPath('userData')));
  manejar('data:backup',     () => ctx.base.respaldar('manual'));

  // Carpeta compartida para el Visor.
  manejar('share:status',  () => publicacion.estadoCompartir());
  manejar('share:publish', () => { publicacion.publicarAhora(); return publicacion.estadoCompartir(); });
  manejar('share:pick', async () => {
    const res = await dialog.showOpenDialog(ctx.ventana, {
      title: 'Carpeta compartida para el Visor', properties: ['openDirectory', 'createDirectory'],
      defaultPath: CARPETA_COMPARTIDA_PREDETERMINADA && fs.existsSync(path.dirname(CARPETA_COMPARTIDA_PREDETERMINADA)) ? path.dirname(CARPETA_COMPARTIDA_PREDETERMINADA) : undefined,
    });
    if (res.canceled || !res.filePaths[0]) return publicacion.estadoCompartir();
    ctx.base.guardarAjuste('carpetaCompartida', res.filePaths[0]);
    publicacion.publicarAhora();
    return publicacion.estadoCompartir();
  });
  manejar('share:disable', () => { ctx.base.guardarAjuste('carpetaCompartida', '-'); publicacion.publicarAhora(); return publicacion.estadoCompartir(); });
}

// El Visor solo lee: no se registra ningun canal que modifique datos.
function registrarManejadoresVisor() {
  registrarManejadoresComunes();
  manejar('viewer:pickDir', () => visor.elegirCarpetaVisor());
  manejar('viewer:reload',  async () => { await visor.cargarVisor(); return estadoApp.estado(); });
  manejar('setting:set',    () => true);
}

Object.assign(module.exports, { registrarManejadores, registrarManejadoresVisor });
