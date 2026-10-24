// Importar una planilla con la app en uso (sumarla a lo que ya hay o reemplazar todo) y
// descargar la planilla modelo.
import { aplicarEstado, dibujar } from '../app.js';
import { call } from '../nucleo/api.js';
import { $, esc, mostrarAviso } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { cerrarModal, abrirModal } from '../nucleo/modales.js';
import { llenarAniosBase } from '../vistas/base-datos.js';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Guarda la planilla modelo donde elija el usuario.
async function descargarPlanilla() {
  try { if (await call('descargarModelo')) mostrarAviso('&#10003; Planilla modelo guardada', 'ok'); }
  catch (err) { mostrarAviso('Error al guardar la planilla: ' + esc(err.message), 'err'); }
}

async function importar() {
  const modo = document.querySelector('input[name="imp-modo"]:checked').value;
  if (modo === 'reemplazar' && !confirm('Se van a borrar los alquileres y administraciones actuales y se van a cargar los de la planilla.\n\nSe puede deshacer con Ctrl+Z. ¿Seguir?')) return;
  try {
    const res = await call(modo === 'agregar' ? 'importarSumar' : 'importarReemplazar');
    if (!res) return;                                   // dialogo cancelado
    cerrarModal('modal-importar');
    aplicarEstado(res.estado);
    estado.filasAbiertas.clear();
    llenarAniosBase();
    dibujar();
    if (modo === 'agregar') {
      const r = res.resultado;
      mostrarAviso(`&#10003; Agregados ${plural(r.agregados, 'alquiler', 'alquileres')}` +
        (r.administraciones ? ` y ${plural(r.administraciones, 'administración', 'administraciones')}` : '') +
        (r.repetidos ? ` (${plural(r.repetidos, 'repetido salteado', 'repetidos salteados')})` : ''), 'ok');
    } else {
      mostrarAviso(`&#10003; Importados ${plural(res.cantidades.contratos, 'alquiler', 'alquileres')} y ${plural(res.cantidades.administraciones, 'administración', 'administraciones')}`, 'ok');
    }
  } catch (err) { mostrarAviso('Error al importar: ' + esc(err.message), 'err'); }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  $('btn-menu-importar').addEventListener('click', () => {
    document.querySelector('input[name="imp-modo"][value="agregar"]').checked = true;
    abrirModal('modal-importar');
  });
  $('imp-elegir').addEventListener('click', importar);
  // Planilla modelo: desde la pantalla de inicio, el menu ☰ y esta ventana.
  for (const id of ['btn-template', 'btn-menu-template', 'imp-modelo']) $(id).addEventListener('click', descargarPlanilla);
}
