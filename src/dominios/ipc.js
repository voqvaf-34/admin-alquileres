// IPC del INE: que mes esta publicado y como leerlo de la pagina.
import { MES_ES } from './fechas.js';

// El INE publica el IPC del mes anterior alrededor del dia 5.
export function ultimoIPCPublicado(now) {
  const d = now.getDate(), m = now.getMonth()+1, y = now.getFullYear();
  if (d >= 5) return m === 1 ? {month:12, year:y-1} : {month:m-1, year:y};
  if (m === 1) return {month:11, year:y-1};
  if (m === 2) return {month:12, year:y-1};
  return {month:m-2, year:y};
}

export function mesAnterior({month, year}) {
  return month === 1 ? {month:12, year:year-1} : {month:month-1, year};
}

export function urlPaginaIPC(month, year) {
  return `https://www.gub.uy/instituto-nacional-estadistica/comunicacion/publicaciones/indice-precios-del-consumo-ipc-${MES_ES[month]}-${year}`;
}

export function interpretarIPCDesdeHtml(html) {
  if (!html) return null;
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const patterns = [
    /[uú]ltimos\s+12\s+meses\s+(?:de|fue de|es de|se ubic[oó] en)?\s*([\d]+[,.][\d]+)\s*%/i,
    /Var\.?\s*12\s+meses\)?\s*(?:\d{2}\/\d{2})?:?\s*([\d]+[,.][\d]+)\s*%/i,
    /interanual[^%]{0,60}?([\d]+[,.][\d]+)\s*%/i,
    /12\s*meses[^%]{0,80}?([\d]+[,.][\d]{1,2})\s*%/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (isFinite(v) && v > -50 && v < 100) return v;
    }
  }
  return null;
}
