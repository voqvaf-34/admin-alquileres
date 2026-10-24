// Aumentos por IPC: que alquileres aumentan en un mes.
import { gestionadoPor } from './contratos.js';
import { claveAumento, claveNoAumenta } from './marcas.js';

// Un aumento ya enviado actualiza ultimoAumento al mes actual; la mark del mes
// lo mantiene visible como resuelto en vez de desaparecer de la lista.
export function obtenerAumentos(lista, m, y, marcas) {
  return lista.filter(e => {
    if (e.inactivo)  return false;
    if (gestionadoPor(e)) return false;
    if (!e.fechaInicio) return false;
    if (marcas && marcas[claveAumento(e, m, y)]) return true;
    if (e.ultimoAumento) {
      if (e.ultimoAumento.getMonth() + 1 !== m) return false;
      return e.ultimoAumento.getFullYear() + 1 <= y;
    }
    if (e.fechaInicio.getMonth() + 1 !== m) return false;
    if (e.fechaInicio.getFullYear() >= y) return false;
    return e.fechaInicio.getFullYear() + 1 <= y;
  });
}

export function esAumentoResuelto(e, m, y, marcas) {
  return !!(marcas[claveAumento(e, m, y)] || marcas[claveNoAumenta(e, m, y)]);
}
