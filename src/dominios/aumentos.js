// Aumentos por IPC: que alquileres aumentan en un mes.
import { gestionadoPor } from './contratos.js';
import { aumKey, naKey } from './marcas.js';

// Un aumento ya enviado actualiza ultimoAumento al mes actual; la mark del mes
// lo mantiene visible como resuelto en vez de desaparecer de la lista.
export function getAumentos(list, m, y, marks) {
  return list.filter(e => {
    if (e.inactive)  return false;
    if (gestionadoPor(e)) return false;
    if (!e.fechaInicio) return false;
    if (marks && marks[aumKey(e, m, y)]) return true;
    if (e.ultimoAumento) {
      if (e.ultimoAumento.getMonth() + 1 !== m) return false;
      return e.ultimoAumento.getFullYear() + 1 <= y;
    }
    if (e.fechaInicio.getMonth() + 1 !== m) return false;
    if (e.fechaInicio.getFullYear() >= y) return false;
    return e.fechaInicio.getFullYear() + 1 <= y;
  });
}

export function isAumentoResuelto(e, m, y, marks) {
  return !!(marks[aumKey(e, m, y)] || marks[naKey(e, m, y)]);
}
