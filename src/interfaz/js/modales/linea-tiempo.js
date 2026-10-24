// Linea de tiempo de un contrato.
import * as D from '../../../dominios/index.js';
import { formatearFecha } from '../../../dominios/index.js';
import { esc } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { formatearNombres } from '../nucleo/formato.js';

// Historia de UN contrato: cuando entro, cuando vencio y cada renovacion (solo si renovo).
export function mostrarLineaTiempo(e) {
  if (!e) return;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ev = D.lineaTiempo(e, estado.marcas, estado.entradas);
  document.getElementById('tl-dir').innerHTML =
    `<strong>${esc(e.direccion)}</strong> &middot; ${formatearNombres(e.inquilino)}${e.inactivo ? ' <span class="inactive-badge">INACTIVO</span>' : ''}`;
  document.getElementById('tl-list').innerHTML = ev.map(x => `
    <div class="tl-item tl-${x.tipo}${x.fecha && x.fecha > hoy ? ' tl-futuro' : ''}">
      <div class="tl-date">${x.fecha ? formatearFecha(x.fecha) : ''}</div>
      <div class="tl-dot"></div>
      <div class="tl-body"><div class="tl-title">${esc(x.titulo)}</div>${x.detalle ? `<div class="tl-det">${esc(x.detalle)}</div>` : ''}</div>
    </div>`).join('') || '<div class="empty">Sin datos para armar la línea de tiempo.</div>';
  document.getElementById('modal-timeline').classList.add('open');
}
