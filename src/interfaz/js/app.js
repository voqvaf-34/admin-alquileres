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
import { bindAutocomplete } from './componentes/autocompletado.js';
import { pintarAviso } from './componentes/avisos.js';
import { aplicarMarca } from './componentes/marca.js';
import { marcarVisto, pintarNovedades } from './componentes/novedades.js';
import { paintSave, paintShare, paintViewer, viewerUseState } from './componentes/compartir.js';
import { paintUndo } from './componentes/deshacer.js';
import { consultarIPC } from './componentes/ipc.js';
import { call } from './nucleo/api.js';
import { entryByDir, saveNotes, vencColor } from './nucleo/datos.js';
import { esc, showToast } from './nucleo/dom.js';
import { applyOwners, estado } from './nucleo/estado.js';
import { MONTH_NAMES, colorPorDias } from './nucleo/formato.js';
import { renderAdminTable } from './vistas/administraciones.js';
import { populateDBYears, renderDBTable } from './vistas/base-datos.js';
import { contarPendientesAumentos, renderAumentos } from './vistas/aumentos.js';
import { contarPendientesRenovaciones, renderRenovaciones } from './vistas/renovaciones.js';
import { renderOwnersPanel } from './vistas/propietarios.js';

export function applyState(st) {
  estado.entries  = st.contracts.map(D.hidratarContrato);
  estado.admins   = st.admins;
  estado.marks    = st.marks || {};
  estado.appSettings = st.settings || {};
  aplicarMarca(estado.appSettings);
  applyOwners(st);
  paintUndo(st.estadoDeshacer);
  if (st.share) paintShare(st.share);
  if (st.save) paintSave(st.save);
  if (st.viewer) paintViewer(st.viewer);
  if (st.settings && st.settings.ipc) {
    estado.ipc = parseFloat(st.settings.ipc) || estado.ipc;
    const inp = document.getElementById('inp-ipc');
    if (inp) inp.value = estado.ipc;
  }
}

export function render() {
  if (!estado.entries) return;
  const activos = estado.entries.filter(e => !e.inactive).length;
  document.getElementById('file-info').textContent = `${document.body.classList.contains('viewer') ? 'Base compartida' : 'Base local'} -- ${activos} activos / ${estado.entries.length} total`;

  // Visibilidad de paneles segun tab
  const isDB     = estado.activeTab === 'basedatos';
  const isAdmin  = estado.activeTab === 'administraciones';
  const isOwners = estado.activeTab === 'propietarios';
  const isPanel  = isDB || isAdmin || isOwners;
  document.getElementById('content').style.display      = isPanel  ? 'none'  : 'block';
  document.getElementById('db-panel').style.display     = isDB     ? 'block' : 'none';
  document.getElementById('admin-panel').style.display  = isAdmin  ? 'block' : 'none';
  document.getElementById('owners-panel').style.display = isOwners ? 'block' : 'none';
  document.getElementById('op-controls').style.display  = isPanel  ? 'none'  : 'flex';
  document.getElementById('ipc-group').hidden = estado.activeTab !== 'aumentos';   // el IPC solo aplica a aumentos

  // Aumentos y Renovaciones muestran un circulito (como una notificacion) con lo que falta hacer;
  // los resueltos se ven igual en la lista pero no cuentan.
  pintarAviso('tab-aumentos', contarPendientesAumentos());
  pintarAviso('tab-vencimientos', contarPendientesRenovaciones());
  pintarNovedades();   // Visor: lo nuevo desde la ultima vez que se entro a cada pestaña
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===estado.activeTab));

  if (isDB) {
    renderDBTable();
    return;
  }
  if (isAdmin) {
    renderAdminTable();
    return;
  }
  if (isOwners) {
    renderOwnersPanel();
    return;
  }

  const content = document.getElementById('content');
  if (estado.activeTab === 'aumentos') renderAumentos(content);
  else renderRenovaciones(content);
}

export function showApp() {
  document.getElementById('autoload-screen').style.display = 'none';
  document.getElementById('upload-screen').style.display   = 'none';
  document.getElementById('app-screen').style.display      = 'block';
  document.body.classList.add('in-app');        // la cabecera pasa a ser la barra de titulo
  populateDBYears();
  render();
}

function showAutoLoad(msg) {
  document.getElementById('autoload-status').textContent   = msg || 'Abriendo base de datos...';
  document.getElementById('autoload-screen').style.display = 'flex';
  document.getElementById('upload-screen').style.display   = 'none';
  document.getElementById('app-screen').style.display      = 'none';
  document.body.classList.remove('in-app');
}

function showImportScreen() {
  document.getElementById('drop-label').textContent        = 'o soltá la planilla acá';
  document.getElementById('autoload-screen').style.display = 'none';
  document.getElementById('upload-screen').style.display   = 'flex';
  document.getElementById('app-screen').style.display      = 'none';
  document.body.classList.remove('in-app');
}

async function loadState() {
  showAutoLoad();
  try {
    const st = await call('obtenerEstado');
    if (st.mode === 'viewer') {
      document.body.classList.add('viewer');
      await viewerUseState(st);
      if (!st.needsShared) consultarIPC();
      return;
    }
    applyState(st);
    if (st.needsImport) {
      showImportScreen();
      if (st.asistente) abrirAsistente(() => {});
      return;
    }
    showApp();
    consultarIPC();
  } catch (err) {
    showAutoLoad('Error al abrir la base de datos: ' + err.message);
  }
}

async function runImport(promise) {
  try {
    const res = await promise;
    if (!res) return false;                         // dialogo cancelado
    applyState(res.state);
    estado.expandedRows.clear();
    showApp();
    showToast(`&#10003; Importados ${res.counts.contracts} alquileres y ${res.counts.admins} administraciones`, 'ok');
    consultarIPC();
    return true;
  } catch (err) {
    showToast('Error al importar: ' + esc(err.message), 'err');
    document.getElementById('drop-label').textContent = 'Soltá la planilla acá';
    return false;
  }
}

export const elegirImportacion     = () => runImport(call('elegirImportacion'));

export const importarDesdeArchivo = file => {
  document.getElementById('drop-label').textContent = 'Importando...';
  return runImport(call('importarDesdeArchivo', file));
};

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Meses del selector operativo
  const selMonthEl = document.getElementById('sel-month');
  MONTH_NAMES.slice(1).forEach((name,i) => {
    const o=document.createElement('option'); o.value=i+1; o.textContent=name;
    if(i+1===estado.selMonth) o.selected=true; selMonthEl.appendChild(o);
  });
  selMonthEl.addEventListener('change', e => { estado.selMonth=+e.target.value; render(); });

  const selYearEl = document.getElementById('sel-year');
  const curYear = new Date().getFullYear();
  Array.from({ length: 7 }, (_, i) => curYear - 2 + i).forEach(y => {
    const o=document.createElement('option'); o.value=y; o.textContent=y;
    if(y===estado.selYear) o.selected=true; selYearEl.appendChild(o);
  });
  selYearEl.addEventListener('change', e => { estado.selYear=+e.target.value; render(); });

  document.getElementById('inp-ipc').addEventListener('input', e => { estado.ipc=parseFloat(e.target.value)||0; render(); });
  document.getElementById('inp-ipc').addEventListener('change', () => { call('guardarAjuste', 'ipc', estado.ipc).catch(() => {}); });
  document.getElementById('btn-ipc-fetch').addEventListener('click', consultarIPC);
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { estado.activeTab=b.dataset.tab; marcarVisto(b.dataset.tab); render(); }));

  // Filtros resuelto / sin resolver (tabs operativas)
  document.getElementById('op-show-sinresolver').addEventListener('change', e => {
    estado.opShowSinResolver = e.target.checked;
    if (estado.opShowSinResolver) { estado.opShowResuelto = false; document.getElementById('op-show-resuelto').checked = false; }
    render();
  });
  document.getElementById('op-show-resuelto').addEventListener('change', e => {
    estado.opShowResuelto = e.target.checked;
    if (estado.opShowResuelto) { estado.opShowSinResolver = false; document.getElementById('op-show-sinresolver').checked = false; }
    render();
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
      if (r) showToast(`&#10003; Exportados ${r.files} archivos CSV`, 'ok');
    } catch (err) { showToast('Error al exportar: ' + esc(err.message), 'err'); }
  });

  document.getElementById('btn-start-demo').addEventListener('click', () => runImport(call('cargarDemo')));

  document.getElementById('btn-start-empty').addEventListener('click', async () => {
    try { applyState(await call('empezarVacio')); showApp(); } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
  });
}

// ── Arranque ────────────────────────────────────────────────────────────────────
// Los modulos se ejecutan cuando el HTML ya esta cargado: se conectan los eventos de cada
// parte de la pantalla (las viñetas del formulario antes que el autocompletado) y se cargan
// los datos.

for (const parte of [modales, compartir, aumentos, renovaciones, propietarios, { iniciar }, deshacer, cabecera,
                     baseDatos, administraciones, alquiler, configuracion, importar]) parte.iniciar();
bindAutocomplete();
loadState();

// Acceso de solo lectura al estado para revisar la app desde la consola y para las pruebas
// automaticas (antes eran variables globales).
window.app = Object.freeze({ estado, saveNotes, renderDBTable, entryByDir, colorPorDias, vencColor, Separadores });

