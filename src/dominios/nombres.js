// Nombres y direcciones: formato "Juan de los Santos" y "Edificio - Calle 1234 U601".
export { key } from './texto.js';

const LOWER = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'dos', 'van', 'von']);
const UPPER = new Set(['srl', 'sa', 's.a.', 'sas', 'ltda', 'bps', 'ute', 'antel', 'gge', 'ph', 'w2', 'iii', 'ii', 'iv', 'bs', 'as', 'sd']);

// "JUAN DE LOS SANTOS" -> "Juan de los Santos"; respeta siglas y codigos con numeros (W2, U601).
export function titleCase(s) {
  const str = String(s || '').replace(/\s+/g, ' ').trim();
  if (!str) return '';
  let first = true;
  return str.split(/(\s+|[/\-(),.]+)/).map(tok => {
    if (!tok || /^[\s/\-(),.]+$/.test(tok)) return tok;
    const low = tok.toLocaleLowerCase('es');
    let out;
    if (/\d/.test(tok)) out = tok.toUpperCase();
    else if (UPPER.has(low)) out = tok.toUpperCase();
    else if (!first && LOWER.has(low)) out = low;
    else out = low.charAt(0).toLocaleUpperCase('es') + low.slice(1);
    first = false;
    return out;
  }).join('');
}

// Arma el nombre a mostrar: "Edificio - Calle 1234 U601" (partes opcionales).
export function formatAddress({ edificio, calle, unidad }) {
  const left = String(edificio || '').trim(), mid = String(calle || '').trim(), u = String(unidad || '').trim();
  const unitTxt = u ? (/^\d/.test(u) ? `U${u}` : u) : '';
  const right = [mid, unitTxt].filter(Boolean).join(' ');
  if (left && right) return mid ? `${left} - ${right}` : `${left} ${unitTxt}`;
  return left || right;
}

// Separa texto libre en edificio / calle / unidad / nota. Heuristica: se revisa con reglas.
export function parseAddress(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  const notes = [];
  s = s.replace(/\(([^)]*)\)/g, (_, n) => { notes.push(n.trim()); return ' '; });
  s = s.replace(/\b\d\s*(?:D|DORM\w*|DROM\w*)\b\.?/gi, ' ');        // "1 D", "3 DORMITORIOS"
  s = s.replace(/\s+/g, ' ').trim();

  let unidad = '';
  const extra = s.match(/\s*\+\s*([A-Z]+\s*\d+)\s*$/i);                  // "+ GGE6"
  let extraTxt = '';
  if (extra) { extraTxt = ` + ${extra[1].replace(/\s+/g, '').toUpperCase()}`; s = s.slice(0, extra.index).trim(); }

  const uRe = /(?:^|[\s,])(?:U|UNIDAD|APTO\.?|APT\.?|AP\.?|APARTAMENTO)\s*\.?\s*(\d{1,4}[A-Z]?)\b/i;
  const um = s.match(uRe);
  if (um) { unidad = um[1].toUpperCase(); s = (s.slice(0, um.index) + ' ' + s.slice(um.index + um[0].length)).trim(); }
  if (!unidad) {
    const piso = s.match(/\bPISO\s*(\d+)\b/i);
    if (piso) { unidad = `Piso ${piso[1]}`; s = s.replace(piso[0], ' ').trim(); }
  }
  if (!unidad) {
    const slash = s.match(/^(.*\d)\s*\/\s*(\d{2,4})$/);                 // "Av. Italia 3187/402"
    if (slash) { unidad = slash[2]; s = slash[1]; }
  }

  // Separador entre edificio y calle: " - " o ",".
  const parts = s.split(/\s+-\s+|\s*,\s*/).map(x => x.trim()).filter(Boolean);
  let edificio = '', calle = '';
  const isStreet = p => /[A-Za-zÁÉÍÓÚáéíóúñÑ.]\s*\d{2,5}\b/.test(p) && !/^\d{1,4}$/.test(p);
  if (parts.length >= 2) {
    const si = parts.findIndex(isStreet);
    if (si > 0) { edificio = parts.slice(0, si).join(' '); calle = parts.slice(si).join(' '); }
    else if (si === 0) { calle = parts[0]; if (parts.length > 1 && /^\d+$/.test(parts[1])) notes.push(parts[1]); else edificio = parts.slice(1).join(' '); }
    else edificio = parts.join(' ');
  } else {
    const p = parts[0] || '';
    // "Torre Ceibo Av. Italia 875" / "Edificio Araza Bv. Artigas 2674": edificio + calle en un mismo tramo.
    const m = p.match(/^(.*?)\s+((?:AV\.?|AVDA\.?|BV\.?|BVAR\.?|DR\.?|RAMBLA|CALLE)\s*.*\d{2,5})$/i)
      || (unidad && p.match(/^([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})*)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ.]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúñÑ.]+)*\s+\d{3,5})$/));
    if (m && m[1] && !/^\d/.test(m[2])) { edificio = m[1]; calle = m[2]; }
    else if (!unidad) {
      // "TORRE CEIBO 403", "EDIFICIO ARAZA 903": nombre en mayusculas + numero = edificio + unidad.
      const bu = p.match(/^(.*[A-Za-z].*?)\s+(\d{3,4})$/);
      if (bu && p === p.toUpperCase()) { edificio = bu[1]; unidad = bu[2]; }
      else calle = p;
    } else if (isStreet(p)) calle = p;
    else edificio = p;
  }
  if (unidad) unidad += extraTxt; else if (extraTxt) notes.push(extraTxt.trim());
  return {
    edificio: titleCase(edificio), calle: titleCase(calle), unidad,
    nota: notes.filter(Boolean).map(n => titleCase(n)).join('; '),
  };
}
