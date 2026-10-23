// Vencimientos y renovaciones: cuando vence cada contrato y si esta resuelto.
import { parseISO, parseDMY } from './fechas.js';
import { gestionadoPor, realDuration } from './contratos.js';
import { vncKey, vncKeyR, nrKey } from './marcas.js';

const VENC_ADVANCE_DAYS = 45;

export function baseVencDate(e, marks) {
  const mk = marks[vncKey(e)];
  if (mk && mk.nuevaInicio && mk.renewYears) {
    const ni = parseDMY(mk.nuevaInicio);
    if (ni) return new Date(ni.getFullYear() + mk.renewYears, ni.getMonth(), Math.min(ni.getDate(), 28));
  }
  if (!e.fechaInicio || !e.contratoDuracion) return null;
  const real = realDuration(e.contratoDuracion);
  return new Date(e.fechaInicio.getFullYear() + real, e.fechaInicio.getMonth(), e.fechaInicio.getDate());
}

// "No renueva pero sigue en el apto": el vencimiento se repite cada anio despues del
// ciclo en que se marco, para volver a avisar la renovacion.
export function getVencDate(e, marks) {
  const vd = baseVencDate(e, marks);
  const nr = marks[nrKey(e)];
  if (!vd || !nr || !nr.sigueActivo || !nr.hasta) return vd;
  const hasta = parseISO(nr.hasta);
  const d = new Date(vd);
  while (hasta && d <= hasta) d.setFullYear(d.getFullYear() + 1);
  return d;
}

// La mark "no renueva" resuelve el ciclo actual; si sigue activo, solo hasta su fecha.
export function noRenuevaVigente(e, marks) {
  const nr = marks[nrKey(e)];
  if (!nr) return false;
  if (!nr.sigueActivo) return true;
  const vd = getVencDate(e, marks), hasta = parseISO(nr.hasta);
  return !!(vd && hasta && vd <= hasta);
}

export function getVencimientos(list, m, y, marks) {
  const selDate = new Date(y, m - 1, 1);
  const horizon = new Date(+selDate + VENC_ADVANCE_DAYS * 86400000);
  return list.filter(e => {
    if (e.inactive)  return false;
    if (gestionadoPor(e)) return false;
    const vd = getVencDate(e, marks);
    if (!vd) return false;
    return vd >= selDate && vd <= horizon;
  });
}

export function getVencidosAtrasados(list, m, y, marks) {
  const selDate = new Date(y, m - 1, 1);
  return list.filter(e => {
    if (e.inactive)       return false;
    if (gestionadoPor(e)) return false;
    const nr = marks[nrKey(e)];
    if (nr && !nr.sigueActivo) return false;
    if (marks[vncKey(e)] && !nr) return false;
    const vd = getVencDate(e, marks);
    if (!vd) return false;
    return vd < selDate;
  });
}

export function isVencResuelto(e, marks) {
  const mk = marks[vncKey(e)];
  const isRenCycle = !!(mk && mk.nuevaInicio && mk.renewYears);
  if (marks[nrKey(e)] && noRenuevaVigente(e, marks)) return true;
  return !!(isRenCycle ? marks[vncKeyR(e)] : mk);
}

// Un vencimiento es urgente si faltan 10 dias o menos (o ya paso).
const DIAS_URGENTE = 10;

// Dias desde hoy hasta la fecha: 0 = hoy, 1 = mañana, negativo = ya paso.
export function diasHasta(fecha, hoy = new Date()) {
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((fecha - inicioHoy) / 86400000);
}

// 'urgente' o 'proximo' (sin fecha: 'proximo').
export function urgenciaVencimiento(fecha, hoy = new Date()) {
  return fecha && diasHasta(fecha, hoy) <= DIAS_URGENTE ? 'urgente' : 'proximo';
}
