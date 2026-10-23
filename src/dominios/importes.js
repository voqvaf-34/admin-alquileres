// Importes de alquiler.

export function parseUYAmount(v) {
  if (typeof v === 'number') return v > 0 ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[$\s.]/g, '').replace(',', '.'));
    return isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function nuevoImporte(importe, ipcPct) {
  return Math.floor(importe * (1 + ipcPct/100));
}
