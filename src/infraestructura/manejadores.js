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
  'contrato:agregar': 'Agregar alquiler', 'contrato:editar': 'Editar alquiler', 'contrato:modificar': 'Modificar alquiler',
  'contrato:inactivar': 'Marcar inactivo', 'administracion:guardar': 'Guardar administracion', 'administracion:borrar': 'Eliminar administracion',
  'marcas:guardar': 'Cambiar marca', 'propietario:guardar': 'Guardar propietario', 'propietario:borrar': 'Eliminar propietario',
  'propietario:unificar': 'Unificar propietarios', 'propietario:cuenta': 'Cuenta de cobro', 'propietario:agregarDocs': 'Agregar documento',
  'propietario:borrarDoc': 'Eliminar documento', 'contrato:asignarPropietarios': 'Cambiar propietarios',
  'importar:demo': 'Cargar datos de ejemplo', 'importar:elegir': 'Importar Excel', 'importar:desdeRuta': 'Importar Excel', 'importar:sumar': 'Agregar planilla', 'importar:reemplazar': 'Reemplazar con planilla', 'configuracion:guardar': 'Cambiar configuración',
};

const EXTENSIONES_PLANILLA = ['xlsx', 'xlsm', 'xls', 'csv'];

// Cambios grandes: siempre un paso propio de deshacer (no se agrupan con el anterior).
const UNDO_SEPARADOS = new Set(['importar:demo', 'importar:elegir', 'importar:desdeRuta', 'importar:sumar', 'importar:reemplazar']);

function avisarDeshacer() {
  if (ctx.ventana && !ctx.ventana.isDestroyed()) {
    ctx.ventana.webContents.send('deshacer:cambiado', ctx.base.estadoDeshacer());
    ctx.ventana.webContents.send('guardado:cambiado', ctx.base.estadoGuardado);
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
  manejar('estado:obtener',            () => estadoApp.estado());
  manejar('deshacer:estado',          () => (ctx.base ? ctx.base.estadoDeshacer() : {}));
  // En las pruebas (ADMIN_ALQ_NO_EXTERNAL) no se consulta al INE: el resultado no depende de internet.
  manejar('ipc:consultar',            () => (process.env.ADMIN_ALQ_NO_EXTERNAL ? { ok: false, error: 'Consulta al INE desactivada en las pruebas.' } : consultarUltimoIPC()));
  manejar('propietario:vistaPreviaDoc',     (id) => vistaPreviaDoc(id));
  manejar('propietario:abrirDoc',        (id) => shell.openPath(archivoDoc(id).p));
  manejar('datos:exportarCsv',       () => exportarCsv());
  manejar('ventana:colorBarraTitulo', (c, tinta) => ventana.ponerColorBarraTitulo(c, tinta));
  manejar('ventana:icono',          (png) => ventana.ponerIconoApp(png));
  manejar('ventana:zoom',          (f) => ventana.ponerZoom(f));
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

  manejar('importar:elegir',     async () => reemplazarCon(await elegirPlanilla()));
  manejar('importar:reemplazar',  async () => reemplazarCon(await elegirPlanilla()));
  manejar('importar:desdeRuta', (rutaArchivo) => {
    const ext = typeof rutaArchivo === 'string' && path.extname(rutaArchivo).slice(1).toLowerCase();
    if (!EXTENSIONES_PLANILLA.includes(ext)) throw new Error('Archivo no valido.');
    return reemplazarCon(rutaArchivo);
  });
  manejar('importar:sumar', async () => {
    const archivo = await elegirPlanilla();
    return archivo ? { resultado: estadoApp.agregarDesde(archivo), estado: estadoApp.estado() } : null;
  });
  manejar('importar:demo', () => estadoApp.cargarDemo());
  manejar('importar:modelo', async () => {
    const res = await dialog.showSaveDialog(ctx.ventana, {
      title: 'Guardar planilla modelo', defaultPath: path.join(app.getPath('documents'), 'planilla-alquileres.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (res.canceled || !res.rutaArchivo) return null;
    escribirModelo(res.rutaArchivo);
    shell.showItemInFolder(res.rutaArchivo);
    return res.rutaArchivo;
  });
  manejar('inicio:vacio', () => {
    ctx.base.guardarAjuste('inicializada', '1');
    ctx.base.guardarAjuste('versionPropietarios', VERSION_PROPIETARIOS);
    ctx.base.guardarAjuste('versionDirecciones', VERSION_DIRECCIONES);
    ctx.base.guardarAjuste('versionLimpieza', VERSION_LIMPIEZA);
    ctx.base.guardarAjuste('versionGarantias', VERSION_GARANTIAS);
    ctx.base.guardarAjuste('versionMoneda', VERSION_MONEDA);
    return estadoApp.estado();
  });

  manejar('deshacer:deshacer',   () => { const etiqueta = ctx.base.deshacerCambio(); avisarDeshacer(); return { etiqueta, estado: estadoApp.estado() }; });
  manejar('deshacer:rehacer',   () => { const etiqueta = ctx.base.rehacerCambio(); avisarDeshacer(); return { etiqueta, estado: estadoApp.estado() }; });

  // Alta/edicion: ademas del contrato se vinculan los propietarios escritos en el modal.
  const guardarConPropietarios = (guardado, c) => {
    if (c.propietario != null) ctx.base.vincularPropietariosDesdeTexto(guardado.id, c.propietario, c.telProp, c.mailProp, claveNombre);
    return { contrato: guardado, propietarios: ctx.base.listarPropietarios(), contratosPropietarios: ctx.base.listarPropietariosDeContratos() };
  };
  manejar('contrato:agregar',        (c)         => { const x = D.normalizarContrato(c); return guardarConPropietarios(ctx.base.agregarContrato(x), x); });
  manejar('contrato:editar',     (id, c)     => { const x = D.normalizarContrato(c); return guardarConPropietarios(ctx.base.editarContrato(id, x), x); });
  manejar('contrato:modificar',      (id, f)     => ctx.base.modificarContrato(id, f));
  manejar('contrato:inactivar', (id)        => ctx.base.marcarInactivo(id));

  manejar('administracion:guardar',   (a)  => { ctx.base.guardarAdmin(a); return ctx.base.listarAdmins(); });
  manejar('administracion:borrar', (id) => { ctx.base.borrarAdmin(id); return ctx.base.listarAdmins(); });

  manejar('marcas:guardar',   (m)      => { ctx.base.reemplazarMarcas(m); return true; });
  manejar('ajuste:guardar',  (k, v)   => { ctx.base.guardarAjuste(k, v); return true; });
  // Configuracion (marca y plantillas de mensajes): se valida todo antes de guardar nada.
  manejar('configuracion:guardar', ({ marca, mensajes, asistente } = {}) => {
    ctx.base.guardarAjustes({ ...(marca ? D.marcaASettings(marca) : {}), ...(mensajes ? D.mensajesASettings(mensajes) : {}),
      ...(asistente ? { asistenteVisto: '1' } : {}) });
    return { ajustes: ctx.base.obtenerAjustes() };
  });

  const estadoPropietarios = () => ({
    propietarios: ctx.base.listarPropietarios(), contactos: ctx.base.listarContactos(), contratosPropietarios: ctx.base.listarPropietariosDeContratos(),
    docsPropietarios: ctx.base.listarDocsPropietarios(), cuentasPropietarios: ctx.base.listarCuentasPropietarios(),
  });
  // El propietario se guarda junto con su contacto (nuevo, existente editado o ninguno).
  manejar('propietario:guardar', (o) => {
    let idContacto = null;
    const c = o.contacto || { modo: 'none' };
    if (c.modo === 'new' || c.modo === 'existing') {
      idContacto = ctx.base.guardarContacto({ id: c.modo === 'existing' ? c.id : null, nombre: D.mayusculasIniciales(c.nombre), rol: c.rol,
        telefono: c.telefono, mail: c.mail, notas: c.notas });
    }
    ctx.base.guardarPropietario({ ...o, nombre: D.mayusculasIniciales(o.nombre), idContacto });
    return estadoPropietarios();
  });
  manejar('propietario:borrar',   (id)                  => { ctx.base.borrarPropietario(id); return estadoPropietarios(); });
  manejar('propietario:unificar',    (conservar, quitar)          => { ctx.base.unificarPropietarios(conservar, quitar); return estadoPropietarios(); });
  manejar('propietario:cuenta',  (idPropietario, dir, cuenta) => { ctx.base.ponerCuentaPropietario(idPropietario, dir, cuenta); return estadoPropietarios(); });
  manejar('propietario:agregarDocs',  async (idPropietario)       => { await elegirDocsPropietario(idPropietario); return estadoPropietarios(); });
  manejar('propietario:borrarDoc', (id)                 => { ctx.base.borrarDocPropietario(id); return estadoPropietarios(); });
  manejar('contrato:asignarPropietarios', (id, ids)         => { ctx.base.asignarPropietariosContrato(id, ids); return estadoPropietarios(); });

  manejar('datos:abrirCarpeta', () => shell.openPath(app.getPath('userData')));
  manejar('datos:respaldar',     () => ctx.base.respaldar('manual'));

  // Carpeta compartida para el Visor.
  manejar('compartir:estado',  () => publicacion.estadoCompartir());
  manejar('compartir:publicar', () => { publicacion.publicarAhora(); return publicacion.estadoCompartir(); });
  manejar('compartir:elegir', async () => {
    const res = await dialog.showOpenDialog(ctx.ventana, {
      title: 'Carpeta compartida para el Visor', properties: ['openDirectory', 'createDirectory'],
      defaultPath: CARPETA_COMPARTIDA_PREDETERMINADA && fs.existsSync(path.dirname(CARPETA_COMPARTIDA_PREDETERMINADA)) ? path.dirname(CARPETA_COMPARTIDA_PREDETERMINADA) : undefined,
    });
    if (res.canceled || !res.filePaths[0]) return publicacion.estadoCompartir();
    ctx.base.guardarAjuste('carpetaCompartida', res.filePaths[0]);
    publicacion.publicarAhora();
    return publicacion.estadoCompartir();
  });
  manejar('compartir:desactivar', () => { ctx.base.guardarAjuste('carpetaCompartida', '-'); publicacion.publicarAhora(); return publicacion.estadoCompartir(); });
}

// El Visor solo lee: no se registra ningun canal que modifique datos.
function registrarManejadoresVisor() {
  registrarManejadoresComunes();
  manejar('visor:elegirCarpeta', () => visor.elegirCarpetaVisor());
  manejar('visor:recargar',  async () => { await visor.cargarVisor(); return estadoApp.estado(); });
  manejar('ajuste:guardar',    () => true);
}

Object.assign(module.exports, { registrarManejadores, registrarManejadoresVisor });
