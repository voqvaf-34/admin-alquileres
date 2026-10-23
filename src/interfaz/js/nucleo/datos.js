// Guardado de cambios (marcas, importes, comentarios) y consultas sobre los datos cargados.
import * as D from '../../../dominios/index.js';
import { call } from './api.js';
import { esc, showToast } from './dom.js';
import { estado, replaceEntry } from './estado.js';
import { colorPorDias } from './formato.js';

export let _marksSaving = Promise.resolve();

export function guardarMarcas() {
  const snapshot = JSON.parse(JSON.stringify(estado.marks));
  _marksSaving = _marksSaving
    .then(() => call('guardarMarcas', snapshot))
    .catch(err => showToast('No se pudieron guardar las marcas: ' + esc(err.message), 'err'));
  return _marksSaving;
}

// Aumento enviado: registra el mes del aumento y el nuevo importe.
export async function saveIncrease(entry, newAmount, date) {
  try {
    const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    replaceEntry(await call('modificarContrato', entry.id, { importe: newAmount, ultimoAumento: D.aFechaISO(firstOfMonth) }));
    showToast('&#10003; Aumento guardado', 'ok');
    return true;
  } catch (err) {
    showToast('Error al guardar el aumento: ' + esc(err.message), 'err');
    return false;
  }
}

export async function saveNotes(entry, text, okMsg) {
  try {
    replaceEntry(await call('modificarContrato', entry.id, { notas: text.trim() }));
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
  const coincidencias = estado.entries.filter(e => e.direccion === dir);
  if (!coincidencias.length) return null;
  const pool = coincidencias.some(e => !e.inactive) ? coincidencias.filter(e => !e.inactive) : coincidencias;
  return pool.reduce((a, b) => (b.id > a.id ? b : a));
}

export const obtenerAumentos          = (list, m, y) => D.obtenerAumentos(list, m, y, estado.marks);

export const obtenerFechaVenc          = e => D.obtenerFechaVenc(e, estado.marks);

export const obtenerVencimientos      = (list, m, y) => D.obtenerVencimientos(list, m, y, estado.marks);

export const obtenerVencidosAtrasados = (list, m, y) => D.obtenerVencidosAtrasados(list, m, y, estado.marks);

export const esAumentoResuelto = (e, m, y) => D.esAumentoResuelto(e, m, y, estado.marks);

export const esVencResuelto    = e => D.esVencResuelto(e, estado.marks);

export const vencRenewalMsg = e => D.mensajeRenovacion(obtenerFechaVenc(e), { settings: estado.appSettings, contrato: e });

// Amarillo si faltan mas de 10 dias para el vencimiento; rojo si faltan 10 o menos (o ya vencio).
export function vencColor(e) { return colorPorDias(obtenerFechaVenc(e)); }
