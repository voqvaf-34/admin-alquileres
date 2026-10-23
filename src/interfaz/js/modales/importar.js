// Importar una planilla con la app en uso (sumarla a lo que ya hay o reemplazar todo) y
// descargar la planilla modelo.
import { applyState, render } from '../app.js';
import { call } from '../nucleo/api.js';
import { esc, showToast } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { closeModal, openModal } from '../nucleo/modales.js';
import { populateDBYears } from '../vistas/base-datos.js';

const $ = id => document.getElementById(id);

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Guarda la planilla modelo donde elija el usuario.
async function descargarPlanilla() {
  try { if (await call('downloadTemplate')) showToast('&#10003; Planilla modelo guardada', 'ok'); }
  catch (err) { showToast('Error al guardar la planilla: ' + esc(err.message), 'err'); }
}

async function importar() {
  const modo = document.querySelector('input[name="imp-modo"]:checked').value;
  if (modo === 'reemplazar' && !confirm('Se van a borrar los alquileres y administraciones actuales y se van a cargar los de la planilla.\n\nSe puede deshacer con Ctrl+Z. ¿Seguir?')) return;
  try {
    const res = await call(modo === 'agregar' ? 'importAdd' : 'importReplace');
    if (!res) return;                                   // dialogo cancelado
    closeModal('modal-importar');
    applyState(res.state);
    estado.expandedRows.clear();
    populateDBYears();
    render();
    if (modo === 'agregar') {
      const r = res.result;
      showToast(`&#10003; Agregados ${plural(r.agregados, 'alquiler', 'alquileres')}` +
        (r.admins ? ` y ${plural(r.admins, 'administración', 'administraciones')}` : '') +
        (r.repetidos ? ` (${plural(r.repetidos, 'repetido salteado', 'repetidos salteados')})` : ''), 'ok');
    } else {
      showToast(`&#10003; Importados ${plural(res.counts.contracts, 'alquiler', 'alquileres')} y ${plural(res.counts.admins, 'administración', 'administraciones')}`, 'ok');
    }
  } catch (err) { showToast('Error al importar: ' + esc(err.message), 'err'); }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  $('btn-menu-importar').addEventListener('click', () => {
    document.querySelector('input[name="imp-modo"][value="agregar"]').checked = true;
    openModal('modal-importar');
  });
  $('imp-elegir').addEventListener('click', importar);
  // Planilla modelo: desde la pantalla de inicio, el menu ☰ y esta ventana.
  for (const id of ['btn-template', 'btn-menu-template', 'imp-modelo']) $(id).addEventListener('click', descargarPlanilla);
}
