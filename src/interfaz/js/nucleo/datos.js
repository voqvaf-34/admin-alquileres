// Guardado de cambios (marcas, importes, comentarios) y consultas sobre los datos cargados.
import * as D from '../../../dominios/index.js';
import { call } from './api.js';
import { esc, showToast } from './dom.js';
import { estado, replaceEntry } from './estado.js';
import { colorPorDias } from './formato.js';

export let _marksSaving = Promise.resolve();

export function saveMarks() {
  const snapshot = JSON.parse(JSON.stringify(estado.marks));
  _marksSaving = _marksSaving
    .then(() => call('saveMarks', snapshot))
    .catch(err => showToast('No se pudieron guardar las marcas: ' + esc(err.message), 'err'));
  return _marksSaving;
}

// Aumento enviado: registra el mes del aumento y el nuevo importe.
export async function saveIncrease(entry, newAmount, date) {
  try {
    const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    replaceEntry(await call('patchContract', entry.id, { importe: newAmount, ultimoAumento: D.toISODate(firstOfMonth) }));
    showToast('&#10003; Aumento guardado', 'ok');
    return true;
  } catch (err) {
    showToast('Error al guardar el aumento: ' + esc(err.message), 'err');
    return false;
  }
}

export async function saveNotes(entry, text, okMsg) {
  try {
    replaceEntry(await call('patchContract', entry.id, { notas: text.trim() }));
    if (okMsg) showToast(okMsg, 'ok');
    return true;
  } catch (err) {
    showToast('Error al guardar el comentario: ' + esc(err.message), 'err');
    return false;
  }
}

export function appendNote(entry, txt) {
  const prev = entry.notas ? entry.notas.trim() : '';
  return prev ? prev + ' | ' + txt : txt;
}

// La renovacion ya queda en las marcas (recuadro verde y linea de tiempo): a los comentarios
// solo va el comentario que se haya escrito al renovar.
export async function saveRenewal(entry, years, comment) {
  if (comment) return saveNotes(entry, appendNote(entry, comment), '&#10003; Renovacion guardada');
  showToast('&#10003; Renovacion guardada', 'ok');
  return true;
}

// Ante direcciones repetidas (re-alquileres) se prioriza el contrato activo mas reciente.
export function entryByDir(dir) {
  if (!estado.entries) return null;
  const all = estado.entries.filter(e => e.direccion === dir);
  if (!all.length) return null;
  const pool = all.some(e => !e.inactive) ? all.filter(e => !e.inactive) : all;
  return pool.reduce((a, b) => (b.id > a.id ? b : a));
}

export const getAumentos          = (list, m, y) => D.getAumentos(list, m, y, estado.marks);

export const getVencDate          = e => D.getVencDate(e, estado.marks);

export const getVencimientos      = (list, m, y) => D.getVencimientos(list, m, y, estado.marks);

export const getVencidosAtrasados = (list, m, y) => D.getVencidosAtrasados(list, m, y, estado.marks);

export const isAumentoResuelto = (e, m, y) => D.isAumentoResuelto(e, m, y, estado.marks);

export const isVencResuelto    = e => D.isVencResuelto(e, estado.marks);

export const vencRenewalMsg = e => D.renewalMessage(getVencDate(e));

// Amarillo si faltan mas de 10 dias para el vencimiento; rojo si faltan 10 o menos (o ya vencio).
export function vencColor(e) { return colorPorDias(getVencDate(e)); }
