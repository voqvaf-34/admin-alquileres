// Vencimientos y renovaciones: cuando vence cada contrato y si esta resuelto.
import { interpretarISO, interpretarDMA } from './fechas.js';
import { gestionadoPor, duracionReal } from './contratos.js';
import { claveVenc, claveVencRenovado, claveNoRenueva } from './marcas.js';

const DIAS_AVISO_VENC = 45;

export function fechaVencBase(e, marks) {
  const mk = marks[claveVenc(e)];
  if (mk && mk.nuevaInicio && mk.renewYears) {
    const ni = interpretarDMA(mk.nuevaInicio);
    if (ni) return new Date(ni.getFullYear() + mk.renewYears, ni.getMonth(), Math.min(ni.getDate(), 28));
  }
  if (!e.fechaInicio || !e.contratoDuracion) return null;
  const real = duracionReal(e.contratoDuracion);
  return new Date(e.fechaInicio.getFullYear() + real, e.fechaInicio.getMonth(), e.fechaInicio.getDate());
}

// "No renueva pero sigue en el apto": el vencimiento se repite cada anio despues del
// ciclo en que se marco, para volver a avisar la renovacion.
export function obtenerFechaVenc(e, marks) {
  const vd = fechaVencBase(e, marks);
  const nr = marks[claveNoRenueva(e)];
  if (!vd || !nr || !nr.sigueActivo || !nr.hasta) return vd;
  const hasta = interpretarISO(nr.hasta);
  const d = new Date(vd);
  while (hasta && d <= hasta) d.setFullYear(d.getFullYear() + 1);
  return d;
}

// La mark "no renueva" resuelve el ciclo actual; si sigue activo, solo hasta su fecha.
export function noRenuevaVigente(e, marks) {
  const nr = marks[claveNoRenueva(e)];
  if (!nr) return false;
  if (!nr.sigueActivo) return true;
  const vd = obtenerFechaVenc(e, marks), hasta = interpretarISO(nr.hasta);
  return !!(vd && hasta && vd <= hasta);
}

export function obtenerVencimientos(list, m, y, marks) {
  const selDate = new Date(y, m - 1, 1);
  const horizon = new Date(+selDate + DIAS_AVISO_VENC * 86400000);
  return list.filter(e => {
    if (e.inactive)  return false;
    if (gestionadoPor(e)) return false;
    const vd = obtenerFechaVenc(e, marks);
    if (!vd) return false;
    return vd >= selDate && vd <= horizon;
  });
}

export function obtenerVencidosAtrasados(list, m, y, marks) {
  const selDate = new Date(y, m - 1, 1);
  return list.filter(e => {
    if (e.inactive)       return false;
    if (gestionadoPor(e)) return false;
    const nr = marks[claveNoRenueva(e)];
    if (nr && !nr.sigueActivo) return false;
    if (marks[claveVenc(e)] && !nr) return false;
    const vd = obtenerFechaVenc(e, marks);
    if (!vd) return false;
    return vd < selDate;
  });
}

export function esVencResuelto(e, marks) {
  const mk = marks[claveVenc(e)];
  const isRenCycle = !!(mk && mk.nuevaInicio && mk.renewYears);
  if (marks[claveNoRenueva(e)] && noRenuevaVigente(e, marks)) return true;
  return !!(isRenCycle ? marks[claveVencRenovado(e)] : mk);
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
