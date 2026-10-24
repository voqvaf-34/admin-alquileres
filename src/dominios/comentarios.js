// Comentarios de un alquiler (se guardan unidos con " | ") y notas de renovacion.

// Los comentarios se guardan unidos con " | ".
export function separarNotas(s) {
  return String(s || '').split(/\s*\|\s*|\n+/).map(x => x.trim()).filter(x => x && x !== '-');
}

const dmy = s => {
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return new Date(y, +m[2] - 1, +m[1]);
};

// Notas que solo registran una renovacion ("En fecha 06/08/2026 se renovo a 2 años",
// "01/03/2024 Renovacion 2 años"): ya se muestran como renovacion, no como comentario.
const NOTA_RENOVACION = [
  /^en fecha (\d{1,2}\/\d{1,2}\/\d{2,4}),? se renov[oó] (?:a|por) (\d+) a[ñn]os?\.?$/i,
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*-?\s*renovaci[oó]n (?:a |por |de )?(\d+) a[ñn]os?\.?$/i,
];

export function interpretarNotaRenovacion(n) {
  for (const re of NOTA_RENOVACION) {
    const m = String(n).trim().match(re);
    if (m && dmy(m[1])) return { fecha: dmy(m[1]), anios: +m[2] };
  }
  return null;
}

export function comentarios(e) { return separarNotas(e.notas).filter(n => !interpretarNotaRenovacion(n)); }
