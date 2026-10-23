// Linea de tiempo de un contrato.
import * as D from '../../../dominios/index.js';
import { formatearFecha } from '../../../dominios/index.js';
import { esc } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { fmtNames } from '../nucleo/formato.js';

// Historia de UN contrato: cuando entro, cuando vencio y cada renovacion (solo si renovo).
export function showTimeline(e) {
  if (!e) return;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ev = D.lineaTiempo(e, estado.marks, estado.entries);
  document.getElementById('tl-dir').innerHTML =
    `<strong>${esc(e.direccion)}</strong> &middot; ${fmtNames(e.inquilino)}${e.inactive ? ' <span class="inactive-badge">INACTIVO</span>' : ''}`;
  document.getElementById('tl-list').innerHTML = ev.map(x => `
    <div class="tl-item tl-${x.tipo}${x.date && x.date > hoy ? ' tl-futuro' : ''}">
      <div class="tl-date">${x.date ? formatearFecha(x.date) : ''}</div>
      <div class="tl-dot"></div>
      <div class="tl-body"><div class="tl-title">${esc(x.titulo)}</div>${x.detalle ? `<div class="tl-det">${esc(x.detalle)}</div>` : ''}</div>
    </div>`).join('') || '<div class="empty">Sin datos para armar la línea de tiempo.</div>';
  document.getElementById('modal-timeline').classList.add('open');
}
