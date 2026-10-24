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
  estado.entradas  = st.contratos.map(D.hidratarContrato);
  estado.administraciones   = st.administraciones;
  estado.marcas    = st.marcas || {};
  estado.ajustesApp = st.ajustes || {};
  aplicarMarca(estado.ajustesApp);
  aplicarPropietarios(st);
  pintarDeshacer(st.estadoDeshacer);
  if (st.compartido) pintarCompartir(st.compartido);
  if (st.save) pintarGuardado(st.save);
  if (st.visor) pintarVisor(st.visor);
  if (st.ajustes && st.ajustes.ipc) {
    estado.ipc = parseFloat(st.ajustes.ipc) || estado.ipc;
    const inp = document.getElementById('campo-ipc');
    if (inp) inp.value = estado.ipc;
  }
}

export function dibujar() {
  if (!estado.entradas) return;
  const activos = estado.entradas.filter(e => !e.inactivo).length;
  document.getElementById('archivo-info').textContent = `${document.body.classList.contains('visor') ? 'Base compartida' : 'Base local'} -- ${activos} activos / ${estado.entradas.length} total`;

  // Visibilidad de paneles segun tab
  const esBase     = estado.pestanaActiva === 'basedatos';
  const esAdmin  = estado.pestanaActiva === 'administraciones';
  const esPropietarios = estado.pestanaActiva === 'propietarios';
  const esPanel  = esBase || esAdmin || esPropietarios;
  document.getElementById('contenido').style.display      = esPanel  ? 'none'  : 'block';
  document.getElementById('base-panel').style.display     = esBase     ? 'block' : 'none';
  document.getElementById('admin-panel').style.display  = esAdmin  ? 'block' : 'none';
  document.getElementById('propietarios-panel').style.display = esPropietarios ? 'block' : 'none';
  document.getElementById('op-controles').style.display  = esPanel  ? 'none'  : 'flex';
  document.getElementById('ipc-grupo').hidden = estado.pestanaActiva !== 'aumentos';   // el IPC solo aplica a aumentos

  // Aumentos y Renovaciones muestran un circulito (como una notificacion) con lo que falta hacer;
  // los resueltos se ven igual en la lista pero no cuentan.
  pintarAviso('pestana-aumentos', contarPendientesAumentos());
  pintarAviso('pestana-vencimientos', contarPendientesRenovaciones());
  pintarNovedades();   // Visor: lo nuevo desde la ultima vez que se entro a cada pestaña
  document.querySelectorAll('.pestana-btn').forEach(b => b.classList.toggle('activo', b.dataset.pestana===estado.pestanaActiva));

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

  const contenido = document.getElementById('contenido');
  if (estado.pestanaActiva === 'aumentos') dibujarAumentos(contenido);
  else dibujarRenovaciones(contenido);
}

export function mostrarApp() {
  document.getElementById('autocarga-pantalla').style.display = 'none';
  document.getElementById('carga-pantalla').style.display   = 'none';
  document.getElementById('app-pantalla').style.display      = 'block';
  document.body.classList.add('en-app');        // la cabecera pasa a ser la barra de titulo
  llenarAniosBase();
  dibujar();
}

function mostrarCargaAuto(msg) {
  document.getElementById('autocarga-estado').textContent   = msg || 'Abriendo base de datos...';
  document.getElementById('autocarga-pantalla').style.display = 'flex';
  document.getElementById('carga-pantalla').style.display   = 'none';
  document.getElementById('app-pantalla').style.display      = 'none';
  document.body.classList.remove('en-app');
}

function mostrarPantallaImportar() {
  document.getElementById('soltar-etiqueta').textContent        = 'o soltá la planilla acá';
  document.getElementById('autocarga-pantalla').style.display = 'none';
  document.getElementById('carga-pantalla').style.display   = 'flex';
  document.getElementById('app-pantalla').style.display      = 'none';
  document.body.classList.remove('en-app');
}

async function cargarEstado() {
  mostrarCargaAuto();
  try {
    const st = await call('obtenerEstado');
    if (st.modo === 'visor') {
      document.body.classList.add('visor');
      await visorUsarEstado(st);
      if (!st.necesitaCompartida) consultarIPC();
      return;
    }
    aplicarEstado(st);
    if (st.necesitaImportar) {
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
    aplicarEstado(res.estado);
    estado.filasAbiertas.clear();
    mostrarApp();
    mostrarAviso(`&#10003; Importados ${res.cantidades.contratos} alquileres y ${res.cantidades.administraciones} administraciones`, 'ok');
    consultarIPC();
    return true;
  } catch (err) {
    mostrarAviso('Error al importar: ' + esc(err.message), 'error');
    document.getElementById('soltar-etiqueta').textContent = 'Soltá la planilla acá';
    return false;
  }
}

export const elegirImportacion     = () => ejecutarImportacion(call('elegirImportacion'));

export const importarDesdeArchivo = archivo => {
  document.getElementById('soltar-etiqueta').textContent = 'Importando...';
  return ejecutarImportacion(call('importarDesdeArchivo', archivo));
};

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Meses del selector operativo
  const elMesElegido = document.getElementById('sel-mes');
  NOMBRES_MESES.slice(1).forEach((nombre,i) => {
    const o=document.createElement('option'); o.value=i+1; o.textContent=nombre;
    if(i+1===estado.mesElegido) o.selected=true; elMesElegido.appendChild(o);
  });
  elMesElegido.addEventListener('change', e => { estado.mesElegido=+e.target.value; dibujar(); });

  const elAnioElegido = document.getElementById('sel-anio');
  const anioActual = new Date().getFullYear();
  Array.from({ length: 7 }, (_, i) => anioActual - 2 + i).forEach(y => {
    const o=document.createElement('option'); o.value=y; o.textContent=y;
    if(y===estado.anioElegido) o.selected=true; elAnioElegido.appendChild(o);
  });
  elAnioElegido.addEventListener('change', e => { estado.anioElegido=+e.target.value; dibujar(); });

  document.getElementById('campo-ipc').addEventListener('input', e => { estado.ipc=parseFloat(e.target.value)||0; dibujar(); });
  document.getElementById('campo-ipc').addEventListener('change', () => { call('guardarAjuste', 'ipc', estado.ipc).catch(() => {}); });
  document.getElementById('btn-ipc-consultar').addEventListener('click', consultarIPC);
  document.querySelectorAll('.pestana-btn').forEach(b => b.addEventListener('click', () => { estado.pestanaActiva=b.dataset.pestana; marcarVisto(b.dataset.pestana); dibujar(); }));

  // Filtros resuelto / sin resolver (tabs operativas)
  document.getElementById('op-mostrar-sinresolver').addEventListener('change', e => {
    estado.opMostrarSinResolver = e.target.checked;
    if (estado.opMostrarSinResolver) { estado.opMostrarResuelto = false; document.getElementById('op-mostrar-resuelto').checked = false; }
    dibujar();
  });
  document.getElementById('op-mostrar-resuelto').addEventListener('change', e => {
    estado.opMostrarResuelto = e.target.checked;
    if (estado.opMostrarResuelto) { estado.opMostrarSinResolver = false; document.getElementById('op-mostrar-sinresolver').checked = false; }
    dibujar();
  });

  // Importacion inicial / cabecera
  document.getElementById('btn-autocarga').addEventListener('click', elegirImportacion);
  document.getElementById('btn-datos-carpeta').addEventListener('click', () => call('abrirCarpetaDatos').catch(() => {}));

  // Drag & drop (pantalla de importacion)
  const dz = document.getElementById('zona-soltar');
  dz.addEventListener('dragover',  e=>{e.preventDefault();dz.classList.add('arrastrando');});
  dz.addEventListener('dragleave', ()=>dz.classList.remove('arrastrando'));
  dz.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('arrastrando');
    if (e.dataTransfer.files[0]) importarDesdeArchivo(e.dataTransfer.files[0]);
  });
  dz.addEventListener('click', elegirImportacion);
  // Evita que soltar un archivo fuera de la zona navegue la ventana hacia el archivo.
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());

  document.getElementById('btn-exportar-csv').addEventListener('click', async () => {
    try {
      const r = await call('exportarCsv');
      if (r) mostrarAviso(`&#10003; Exportados ${r.files} archivos CSV`, 'ok');
    } catch (err) { mostrarAviso('Error al exportar: ' + esc(err.message), 'error'); }
  });

  document.getElementById('btn-inicio-demo').addEventListener('click', () => ejecutarImportacion(call('cargarDemo')));

  document.getElementById('btn-inicio-vacio').addEventListener('click', async () => {
    try { aplicarEstado(await call('empezarVacio')); mostrarApp(); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'error'); }
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

