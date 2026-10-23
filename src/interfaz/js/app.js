// Arranque de la interfaz: carga de datos, pantallas y pestañas.
import * as administraciones from './vistas/administraciones.js';
import * as alquiler from './modales/alquiler.js';
import * as baseDatos from './vistas/base-datos.js';
import * as cabecera from './componentes/cabecera.js';
import * as compartir from './componentes/compartir.js';
import * as configuracion from './modales/configuracion.js';
import { abrirAsistente } from './modales/configuracion.js';
import * as importar from './modales/importar.js';
import * as D from '../../dominios/index.js';
import * as deshacer from './componentes/deshacer.js';
import * as modales from './nucleo/modales.js';
import * as aumentos from './vistas/aumentos.js';
import * as renovaciones from './vistas/renovaciones.js';
import * as propietarios from './vistas/propietarios.js';
import { Separadores } from '../../dominios/index.js';
import { conectarAutocompletado } from './componentes/autocompletado.js';
import { pintarAviso } from './componentes/avisos.js';
import { aplicarMarca } from './componentes/marca.js';
import { marcarVisto, pintarNovedades } from './componentes/novedades.js';
import { pintarGuardado, pintarCompartir, pintarVisor, visorUsarEstado } from './componentes/compartir.js';
import { pintarDeshacer } from './componentes/deshacer.js';
import { consultarIPC } from './componentes/ipc.js';
import { call } from './nucleo/api.js';
import { entradaPorDireccion, guardarNotas, colorVenc } from './nucleo/datos.js';
import { esc, mostrarAviso } from './nucleo/dom.js';
import { aplicarPropietarios, estado } from './nucleo/estado.js';
import { NOMBRES_MESES, colorPorDias } from './nucleo/formato.js';
import { dibujarTablaAdmins } from './vistas/administraciones.js';
import { llenarAniosBase, dibujarTablaBase } from './vistas/base-datos.js';
import { contarPendientesAumentos, dibujarAumentos } from './vistas/aumentos.js';
import { contarPendientesRenovaciones, dibujarRenovaciones } from './vistas/renovaciones.js';
import { dibujarPanelPropietarios } from './vistas/propietarios.js';

export function aplicarEstado(st) {
  estado.entries  = st.contracts.map(D.hidratarContrato);
  estado.admins   = st.admins;
  estado.marks    = st.marks || {};
  estado.appSettings = st.settings || {};
  aplicarMarca(estado.appSettings);
  aplicarPropietarios(st);
  pintarDeshacer(st.estadoDeshacer);
  if (st.share) pintarCompartir(st.share);
  if (st.save) pintarGuardado(st.save);
  if (st.viewer) pintarVisor(st.viewer);
  if (st.settings && st.settings.ipc) {
    estado.ipc = parseFloat(st.settings.ipc) || estado.ipc;
    const inp = document.getElementById('inp-ipc');
    if (inp) inp.value = estado.ipc;
  }
}

export function dibujar() {
  if (!estado.entries) return;
  const activos = estado.entries.filter(e => !e.inactive).length;
  document.getElementById('file-info').textContent = `${document.body.classList.contains('viewer') ? 'Base compartida' : 'Base local'} -- ${activos} activos / ${estado.entries.length} total`;

  // Visibilidad de paneles segun tab
  const esBase     = estado.activeTab === 'basedatos';
  const esAdmin  = estado.activeTab === 'administraciones';
  const esPropietarios = estado.activeTab === 'propietarios';
  const esPanel  = esBase || esAdmin || esPropietarios;
  document.getElementById('content').style.display      = esPanel  ? 'none'  : 'block';
  document.getElementById('db-panel').style.display     = esBase     ? 'block' : 'none';
  document.getElementById('admin-panel').style.display  = esAdmin  ? 'block' : 'none';
  document.getElementById('owners-panel').style.display = esPropietarios ? 'block' : 'none';
  document.getElementById('op-controls').style.display  = esPanel  ? 'none'  : 'flex';
  document.getElementById('ipc-group').hidden = estado.activeTab !== 'aumentos';   // el IPC solo aplica a aumentos

  // Aumentos y Renovaciones muestran un circulito (como una notificacion) con lo que falta hacer;
  // los resueltos se ven igual en la lista pero no cuentan.
  pintarAviso('tab-aumentos', contarPendientesAumentos());
  pintarAviso('tab-vencimientos', contarPendientesRenovaciones());
  pintarNovedades();   // Visor: lo nuevo desde la ultima vez que se entro a cada pestaña
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===estado.activeTab));

  if (esBase) {
    dibujarTablaBase();
    return;
  }
  if (esAdmin) {
    dibujarTablaAdmins();
    return;
  }
  if (esPropietarios) {
    dibujarPanelPropietarios();
    return;
  }

  const contenido = document.getElementById('content');
  if (estado.activeTab === 'aumentos') dibujarAumentos(contenido);
  else dibujarRenovaciones(contenido);
}

export function mostrarApp() {
  document.getElementById('autoload-screen').style.display = 'none';
  document.getElementById('upload-screen').style.display   = 'none';
  document.getElementById('app-screen').style.display      = 'block';
  document.body.classList.add('in-app');        // la cabecera pasa a ser la barra de titulo
  llenarAniosBase();
  dibujar();
}

function mostrarCargaAuto(msg) {
  document.getElementById('autoload-status').textContent   = msg || 'Abriendo base de datos...';
  document.getElementById('autoload-screen').style.display = 'flex';
  document.getElementById('upload-screen').style.display   = 'none';
  document.getElementById('app-screen').style.display      = 'none';
  document.body.classList.remove('in-app');
}

function mostrarPantallaImportar() {
  document.getElementById('drop-label').textContent        = 'o soltá la planilla acá';
  document.getElementById('autoload-screen').style.display = 'none';
  document.getElementById('upload-screen').style.display   = 'flex';
  document.getElementById('app-screen').style.display      = 'none';
  document.body.classList.remove('in-app');
}

async function cargarEstado() {
  mostrarCargaAuto();
  try {
    const st = await call('obtenerEstado');
    if (st.mode === 'viewer') {
      document.body.classList.add('viewer');
      await visorUsarEstado(st);
      if (!st.needsShared) consultarIPC();
      return;
    }
    aplicarEstado(st);
    if (st.needsImport) {
      mostrarPantallaImportar();
      if (st.asistente) abrirAsistente(() => {});
      return;
    }
    mostrarApp();
    consultarIPC();
  } catch (err) {
    mostrarCargaAuto('Error al abrir la base de datos: ' + err.message);
  }
}

async function ejecutarImportacion(promesa) {
  try {
    const res = await promesa;
    if (!res) return false;                         // dialogo cancelado
    aplicarEstado(res.state);
    estado.expandedRows.clear();
    mostrarApp();
    mostrarAviso(`&#10003; Importados ${res.counts.contracts} alquileres y ${res.counts.admins} administraciones`, 'ok');
    consultarIPC();
    return true;
  } catch (err) {
    mostrarAviso('Error al importar: ' + esc(err.message), 'err');
    document.getElementById('drop-label').textContent = 'Soltá la planilla acá';
    return false;
  }
}

export const elegirImportacion     = () => ejecutarImportacion(call('elegirImportacion'));

export const importarDesdeArchivo = archivo => {
  document.getElementById('drop-label').textContent = 'Importando...';
  return ejecutarImportacion(call('importarDesdeArchivo', archivo));
};

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Meses del selector operativo
  const elMesElegido = document.getElementById('sel-month');
  NOMBRES_MESES.slice(1).forEach((nombre,i) => {
    const o=document.createElement('option'); o.value=i+1; o.textContent=nombre;
    if(i+1===estado.selMonth) o.selected=true; elMesElegido.appendChild(o);
  });
  elMesElegido.addEventListener('change', e => { estado.selMonth=+e.target.value; dibujar(); });

  const elAnioElegido = document.getElementById('sel-year');
  const anioActual = new Date().getFullYear();
  Array.from({ length: 7 }, (_, i) => anioActual - 2 + i).forEach(y => {
    const o=document.createElement('option'); o.value=y; o.textContent=y;
    if(y===estado.selYear) o.selected=true; elAnioElegido.appendChild(o);
  });
  elAnioElegido.addEventListener('change', e => { estado.selYear=+e.target.value; dibujar(); });

  document.getElementById('inp-ipc').addEventListener('input', e => { estado.ipc=parseFloat(e.target.value)||0; dibujar(); });
  document.getElementById('inp-ipc').addEventListener('change', () => { call('guardarAjuste', 'ipc', estado.ipc).catch(() => {}); });
  document.getElementById('btn-ipc-fetch').addEventListener('click', consultarIPC);
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { estado.activeTab=b.dataset.tab; marcarVisto(b.dataset.tab); dibujar(); }));

  // Filtros resuelto / sin resolver (tabs operativas)
  document.getElementById('op-show-sinresolver').addEventListener('change', e => {
    estado.opShowSinResolver = e.target.checked;
    if (estado.opShowSinResolver) { estado.opShowResuelto = false; document.getElementById('op-show-resuelto').checked = false; }
    dibujar();
  });
  document.getElementById('op-show-resuelto').addEventListener('change', e => {
    estado.opShowResuelto = e.target.checked;
    if (estado.opShowResuelto) { estado.opShowSinResolver = false; document.getElementById('op-show-sinresolver').checked = false; }
    dibujar();
  });

  // Importacion inicial / cabecera
  document.getElementById('btn-autoload').addEventListener('click', elegirImportacion);
  document.getElementById('btn-data-folder').addEventListener('click', () => call('abrirCarpetaDatos').catch(() => {}));

  // Drag & drop (pantalla de importacion)
  const dz = document.getElementById('dropzone');
  dz.addEventListener('dragover',  e=>{e.preventDefault();dz.classList.add('drag-over');});
  dz.addEventListener('dragleave', ()=>dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) importarDesdeArchivo(e.dataTransfer.files[0]);
  });
  dz.addEventListener('click', elegirImportacion);
  // Evita que soltar un archivo fuera de la zona navegue la ventana hacia el archivo.
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());

  document.getElementById('btn-export-csv').addEventListener('click', async () => {
    try {
      const r = await call('exportarCsv');
      if (r) mostrarAviso(`&#10003; Exportados ${r.files} archivos CSV`, 'ok');
    } catch (err) { mostrarAviso('Error al exportar: ' + esc(err.message), 'err'); }
  });

  document.getElementById('btn-start-demo').addEventListener('click', () => ejecutarImportacion(call('cargarDemo')));

  document.getElementById('btn-start-empty').addEventListener('click', async () => {
    try { aplicarEstado(await call('empezarVacio')); mostrarApp(); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
  });
}

// ── Arranque ────────────────────────────────────────────────────────────────────
// Los modulos se ejecutan cuando el HTML ya esta cargado: se conectan los eventos de cada
// parte de la pantalla (las viñetas del formulario antes que el autocompletado) y se cargan
// los datos.

for (const parte of [modales, compartir, aumentos, renovaciones, propietarios, { iniciar }, deshacer, cabecera,
                     baseDatos, administraciones, alquiler, configuracion, importar]) parte.iniciar();
conectarAutocompletado();
cargarEstado();

// Acceso de solo lectura al estado para revisar la app desde la consola y para las pruebas
// automaticas (antes eran variables globales).
window.app = Object.freeze({ estado, guardarNotas, dibujarTablaBase, entradaPorDireccion, colorPorDias, colorVenc, Separadores });

