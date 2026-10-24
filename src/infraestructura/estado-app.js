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

function estadoActual() {
  if (ES_VISOR && !ctx.base) return { modo: MODO, necesitaCompartida: true, visor: visor.estadoVisor() };
  return {
    modo:      MODO,
    compartido:     ES_VISOR ? null : publicacion.estadoCompartir(),
    save:      ES_VISOR ? null : ctx.base.estadoGuardado,
    visor:    ES_VISOR ? visor.estadoVisor() : null,
    contratos: ctx.base.listarContratos(),
    administraciones:    ctx.base.listarAdmins(),
    propietarios:    ctx.base.listarPropietarios(),
    contactos:  ctx.base.listarContactos(),
    contratosPropietarios: ctx.base.listarPropietariosDeContratos(),
    docsPropietarios: ctx.base.listarDocsPropietarios(),
    cuentasPropietarios: ctx.base.listarCuentasPropietarios(),
    marcas:     ctx.base.obtenerMarcas(),
    ajustes:  ctx.base.obtenerAjustes(),
    estadoDeshacer:      ctx.base.estadoDeshacer(),
    necesitaImportar: !ES_VISOR && ctx.base.estaVacia() && ctx.base.obtenerAjustes().inicializada !== '1',
    // Asistente de primer uso (marca y apariencia). ADMIN_ALQ_SIN_ASISTENTE lo saltea (pruebas).
    asistente: !ES_VISOR && ctx.base.estaVacia() && !ctx.base.obtenerAjustes().asistenteVisto && !process.env.ADMIN_ALQ_SIN_ASISTENTE,
    rutaBase:    rutaBase(),
  };
}

function importarDesde(rutaArchivo) {
  const datos = leerArchivoLibro(rutaArchivo);
  if (!datos.contratos.length) throw new Error('No se encontraron alquileres. Usá la planilla modelo: hacen falta al menos las columnas "Dirección" y "Alquiler actual".');
  ctx.base.respaldar('pre-import');
  const cantidades = ctx.base.importarDatos(datos);
  asegurarDatos(true, { heuristicas: datos.formato === 'clasico' });
  ctx.base.guardarAjuste('inicializada', '1');
  ctx.base.guardarAjuste('importadoDe', rutaArchivo);
  ctx.base.guardarAjuste('importadoEl', new Date().toISOString());
  return cantidades;
}

// Suma una planilla a lo que ya hay (con la app en uso): no toca lo cargado y saltea repetidos.
function agregarDesde(rutaArchivo) {
  const datos = leerArchivoLibro(rutaArchivo);
  if (!datos.contratos.length) throw new Error('No se encontraron alquileres. Usá la planilla modelo: hacen falta al menos las columnas "Dirección" y "Alquiler actual".');
  const clasico = datos.formato === 'clasico';
  ctx.base.respaldar('pre-agregar');
  const res = ctx.base.agregarImportados({ contratos: datos.contratos.map(c => D.prepararImportado(c, { reglasDirecciones: REGLAS_DIRECCIONES, clasico })), administraciones: datos.administraciones }, D.claveNombre);
  ctx.base.guardarAjuste('inicializada', '1');
  return res;
}

// Datos de ejemplo inventados (ver dominios/demo.js): pasan por las mismas normalizaciones que
// una importacion.
function cargarDemo() {
  const { contratos, administraciones, marcas } = D.datosDemo(new Date());
  ctx.base.respaldar('pre-ejemplo');
  const cantidades = ctx.base.importarDatos({ contratos, administraciones });
  asegurarDatos(true, { heuristicas: false });
  ctx.base.reemplazarMarcas(marcas);
  ctx.base.guardarAjuste('inicializada', '1');
  ctx.base.guardarAjuste('importadoDe', 'datos de ejemplo');
  ctx.base.guardarAjuste('importadoEl', new Date().toISOString());
  return { cantidades, estado: estadoActual() };
}

async function abrirBase() {
  ctx.base = await BaseDatos.open(rutaBase());
  asegurarDatos(false);
  publicacion.conectarCompartir();
}

Object.assign(module.exports, { estado: estadoActual, importarDesde, agregarDesde, cargarDemo, abrirBase });
