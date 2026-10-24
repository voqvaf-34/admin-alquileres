// IPC del INE: que mes esta publicado y como leerlo de la pagina.
import { MES_ES } from './fechas.js';

// El INE publica el IPC del mes anterior alrededor del dia 5.
export function ultimoIPCPublicado(ahora) {
  const d = ahora.getDate(), m = ahora.getMonth()+1, y = ahora.getFullYear();
  if (d >= 5) return m === 1 ? {mes:12, anio:y-1} : {mes:m-1, anio:y};
  if (m === 1) return {mes:11, anio:y-1};
  if (m === 2) return {mes:12, anio:y-1};
  return {mes:m-2, anio:y};
}

export function mesAnterior({ mes, anio }) {
  return mes === 1 ? {mes:12, anio:anio-1} : {mes:mes-1, anio};
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
