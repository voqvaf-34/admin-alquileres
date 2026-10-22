// Deshacer / rehacer (botones y Ctrl+Z / Ctrl+Y).
import { applyState, render } from '../app.js';
import { call } from '../nucleo/api.js';
import { _marksSaving } from '../nucleo/datos.js';
import { esc, showToast } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { populateDBYears } from '../vistas/base-datos.js';
import { limpiarPendientes } from '../vistas/operativo.js';

export function paintUndo(st) {
  if (!st) return;
  const u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
  u.disabled = !st.canUndo; r.disabled = !st.canRedo;
  u.title = st.canUndo ? `Deshacer: ${st.undoLabel} (Ctrl+Z)` : 'Nada para deshacer';
  r.title = st.canRedo ? `Rehacer: ${st.redoLabel} (Ctrl+Y)` : 'Nada para rehacer';
}

export async function doUndo(redo) {
  try {
    await _marksSaving;
    const r = await call(redo ? 'redo' : 'undo');
    limpiarPendientes();
    applyState(r.state);
    populateDBYears();
    render();
    showToast(`${redo ? '&#8631; Rehecho' : '&#8630; Deshecho'}: ${esc(r.label)}`, 'info');
  } catch (err) {
    showToast(esc(err.message), 'info');
  }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Deshacer / rehacer: botones, Ctrl+Z y Ctrl+Y (o Ctrl+Shift+Z).
  window.api.onUndoChanged(paintUndo);
  document.getElementById("btn-undo").addEventListener("click", () => doUndo(false));
  document.getElementById("btn-redo").addEventListener("click", () => doUndo(true));
  document.addEventListener("keydown", e => {
    if (!e.ctrlKey || e.altKey || !estado.entries || document.body.classList.contains('viewer')) return;
    if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;   // deshacer de texto nativo
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(false); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doUndo(true); }
  });
}
