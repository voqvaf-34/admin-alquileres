// Deshacer / rehacer (botones y Ctrl+Z / Ctrl+Y).
import { aplicarEstado, dibujar } from '../app.js';
import { call } from '../nucleo/api.js';
import { _guardandoMarcas } from '../nucleo/datos.js';
import { esc, mostrarAviso } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { llenarAniosBase } from '../vistas/base-datos.js';
import { limpiarPendientes } from '../vistas/tarjetas.js';

export function pintarDeshacer(st) {
  if (!st) return;
  const u = document.getElementById('btn-deshacer'), r = document.getElementById('btn-rehacer');
  u.disabled = !st.puedeDeshacer; r.disabled = !st.puedeRehacer;
  u.title = st.puedeDeshacer ? `Deshacer: ${st.etiquetaDeshacer} (Ctrl+Z)` : 'Nada para deshacer';
  r.title = st.puedeRehacer ? `Rehacer: ${st.etiquetaRehacer} (Ctrl+Y)` : 'Nada para rehacer';
}

async function ejecutarDeshacer(rehacer) {
  try {
    await _guardandoMarcas;
    const r = await call(rehacer ? 'rehacerCambio' : 'deshacerCambio');
    limpiarPendientes();
    aplicarEstado(r.estado);
    llenarAniosBase();
    dibujar();
    mostrarAviso(`${rehacer ? '&#8631; Rehecho' : '&#8630; Deshecho'}: ${esc(r.etiqueta)}`, 'info');
  } catch (err) {
    mostrarAviso(esc(err.message), 'info');
  }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Deshacer / rehacer: botones, Ctrl+Z y Ctrl+Y (o Ctrl+Shift+Z).
  window.api.alCambiarDeshacer(pintarDeshacer);
  document.getElementById('btn-deshacer').addEventListener('click', () => ejecutarDeshacer(false));
  document.getElementById('btn-rehacer').addEventListener('click', () => ejecutarDeshacer(true));
  document.addEventListener('keydown', e => {
    if (!e.ctrlKey || e.altKey || !estado.entradas || document.body.classList.contains('visor')) return;
    if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;   // deshacer de texto nativo
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); ejecutarDeshacer(false); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); ejecutarDeshacer(true); }
  });
}
