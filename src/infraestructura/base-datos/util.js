// Normalizacion de valores para guardar: texto sin espacios de mas y numeros (null si no lo es).
function s(v) { return v == null ? '' : String(v).trim(); }
function n(v) { const x = Number(v); return isFinite(x) ? x : null; }

module.exports = { s, n };
