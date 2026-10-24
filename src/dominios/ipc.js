// IPC del INE: que mes esta publicado y como leerlo de la pagina.
import { MES_ES } from './fechas.js';

// El INE publica el IPC del mes anterior alrededor del dia 5.
export function ultimoIPCPublicado(ahora) {
  const d = ahora.getDate(), m = ahora.getMonth()+1, y = ahora.getFullYear();
  if (d >= 5) return m === 1 ? {month:12, year:y-1} : {month:m-1, year:y};
  if (m === 1) return {month:11, year:y-1};
  if (m === 2) return {month:12, year:y-1};
  return {month:m-2, year:y};
}

export function mesAnterior({month: mes, year: anio}) {
  return mes === 1 ? {month:12, year:anio-1} : {month:mes-1, year: anio};
}

export function urlPaginaIPC(mes, anio) {
  return `https://www.gub.uy/instituto-nacional-estadistica/comunicacion/publicaciones/indice-precios-del-consumo-ipc-${MES_ES[mes]}-${anio}`;
}

export function interpretarIPCDesdeHtml(html) {
  if (!html) return null;
  const texto = String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const patrones = [
    /[uú]ltimos\s+12\s+meses\s+(?:de|fue de|es de|se ubic[oó] en)?\s*([\d]+[,.][\d]+)\s*%/i,
    /Var\.?\s*12\s+meses\)?\s*(?:\d{2}\/\d{2})?:?\s*([\d]+[,.][\d]+)\s*%/i,
    /interanual[^%]{0,60}?([\d]+[,.][\d]+)\s*%/i,
    /12\s*meses[^%]{0,80}?([\d]+[,.][\d]{1,2})\s*%/i,
  ];
  for (const re of patrones) {
    const m = texto.match(re);
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (isFinite(v) && v > -50 && v < 100) return v;
    }
  }
  return null;
}
