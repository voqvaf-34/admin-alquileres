// Importar las marcas de la app anterior.
import { render } from '../app.js';
import { saveMarks } from '../nucleo/datos.js';
import { copyToClipboard, showToast } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';

export function showMarksModal() {
  document.getElementById('m-marks-json').value = '';
  document.getElementById('modal-marks').classList.add('open');
  setTimeout(() => document.getElementById('m-marks-json').focus(), 80);
}

export function hideMarksModal() { document.getElementById('modal-marks').classList.remove('open'); }

export async function submitMarksImport() {
  let raw = document.getElementById('m-marks-json').value.trim();
  // La consola a veces copia el JSON como string entre comillas: "{...}"
  if (/^".*"$/s.test(raw)) { try { raw = JSON.parse(raw); } catch (_) {} }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { showToast('El texto pegado no es JSON valido.', 'err'); return; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { showToast('Formato de marcas no reconocido.', 'err'); return; }
  const valid = Object.entries(parsed).filter(([k, v]) => /^(a|na|v|vr|nr)\|/.test(k) && v && typeof v === 'object');
  if (!valid.length) { showToast('No se encontraron marcas en el texto.', 'err'); return; }
  const nuevas = valid.filter(([k]) => !estado.marks[k]).length;
  for (const [k, v] of valid) if (!estado.marks[k]) estado.marks[k] = v;   // las marcas existentes en esta app tienen prioridad
  await saveMarks();
  hideMarksModal();
  render();
  showToast(`&#10003; ${nuevas} marcas importadas${valid.length > nuevas ? ` (${valid.length - nuevas} ya existian)` : ''}`, 'ok');
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.getElementById("btn-import-marks").addEventListener("click", showMarksModal);
  document.getElementById("modal-marks-close").addEventListener("click", hideMarksModal);
  document.getElementById("modal-marks-cancel").addEventListener("click", hideMarksModal);
  document.getElementById("modal-marks-submit").addEventListener("click", submitMarksImport);
  document.getElementById("btn-copy-snippet").addEventListener("click", e => {
    copyToClipboard(document.getElementById("marks-snippet").textContent);
    e.target.textContent = "✓";
    setTimeout(() => { e.target.innerHTML = "&#8663; Copiar"; }, 1500);
  });
}
