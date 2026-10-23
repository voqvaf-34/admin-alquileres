// Estado que se manda a la pantalla; abrir la base e importar datos.
const D = require('../dominios/index.js');
const { BaseDatos } = require('./base-datos');
const { leerArchivoLibro } = require('./importador-excel');
const { ctx } = require('./contexto');
const { REGLAS_DIRECCIONES, ES_VISOR, MODO } = require('./config');
const { asegurarDatos } = require('./migraciones');
const publicacion = require('./publicacion');
const { rutaBase } = require('./rutas');
const visor = require('./visor');

function state() {
  if (ES_VISOR && !ctx.store) return { mode: MODO, needsShared: true, viewer: visor.estadoVisor() };
  return {
    mode:      MODO,
    share:     ES_VISOR ? null : publicacion.estadoCompartir(),
    save:      ES_VISOR ? null : ctx.store.saveStatus,
    viewer:    ES_VISOR ? visor.estadoVisor() : null,
    contracts: ctx.store.listarContratos(),
    admins:    ctx.store.listarAdmins(),
    owners:    ctx.store.listarPropietarios(),
    contacts:  ctx.store.listarContactos(),
    contractOwners: ctx.store.listarPropietariosDeContratos(),
    ownerDocs: ctx.store.listarDocsPropietarios(),
    ownerAccounts: ctx.store.listarCuentasPropietarios(),
    marks:     ctx.store.obtenerMarcas(),
    settings:  ctx.store.obtenerAjustes(),
    estadoDeshacer:      ctx.store.estadoDeshacer(),
    needsImport: !ES_VISOR && ctx.store.estaVacia() && ctx.store.obtenerAjustes().initialized !== '1',
    // Asistente de primer uso (marca y apariencia). ADMIN_ALQ_SIN_ASISTENTE lo saltea (pruebas).
    asistente: !ES_VISOR && ctx.store.estaVacia() && !ctx.store.obtenerAjustes().asistenteVisto && !process.env.ADMIN_ALQ_SIN_ASISTENTE,
    rutaBase:    rutaBase(),
  };
}

function importarDesde(rutaArchivo) {
  const datos = leerArchivoLibro(rutaArchivo);
  if (!datos.contracts.length) throw new Error('No se encontraron alquileres. Usá la planilla modelo: hacen falta al menos las columnas "Dirección" y "Alquiler actual".');
  ctx.store.respaldar('pre-import');
  const cantidades = ctx.store.importarDatos(datos);
  asegurarDatos(true, { heuristicas: datos.formato === 'clasico' });
  ctx.store.guardarAjuste('initialized', '1');
  ctx.store.guardarAjuste('importedFrom', rutaArchivo);
  ctx.store.guardarAjuste('importedAt', new Date().toISOString());
  return cantidades;
}

// Suma una planilla a lo que ya hay (con la app en uso): no toca lo cargado y saltea repetidos.
function agregarDesde(rutaArchivo) {
  const datos = leerArchivoLibro(rutaArchivo);
  if (!datos.contracts.length) throw new Error('No se encontraron alquileres. Usá la planilla modelo: hacen falta al menos las columnas "Dirección" y "Alquiler actual".');
  const clasico = datos.formato === 'clasico';
  ctx.store.respaldar('pre-agregar');
  const res = ctx.store.agregarImportados({ contracts: datos.contracts.map(c => D.prepararImportado(c, { reglasDirecciones: REGLAS_DIRECCIONES, clasico })), admins: datos.admins }, D.claveNombre);
  ctx.store.guardarAjuste('initialized', '1');
  return res;
}

// Datos de ejemplo inventados (ver dominios/demo.js): pasan por las mismas normalizaciones que
// una importacion.
function cargarDemo() {
  const { contracts: contratos, admins, marks } = D.datosDemo(new Date());
  ctx.store.respaldar('pre-ejemplo');
  const cantidades = ctx.store.importarDatos({ contracts: contratos, admins });
  asegurarDatos(true, { heuristicas: false });
  ctx.store.reemplazarMarcas(marks);
  ctx.store.guardarAjuste('initialized', '1');
  ctx.store.guardarAjuste('importedFrom', 'datos de ejemplo');
  ctx.store.guardarAjuste('importedAt', new Date().toISOString());
  return { counts: cantidades, state: state() };
}

async function abrirBase() {
  ctx.store = await BaseDatos.open(rutaBase());
  asegurarDatos(false);
  publicacion.conectarCompartir();
}

Object.assign(module.exports, { state, importarDesde, agregarDesde, cargarDemo, abrirBase });
