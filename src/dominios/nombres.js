// Nombres y direcciones: formato "Juan de los Santos" y "Edificio - Calle 1234 U601".
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'dos', 'van', 'von']);
const SIGLAS = new Set(['srl', 'sa', 's.a.', 'sas', 'ltda', 'bps', 'ute', 'antel', 'gge', 'ph', 'w2', 'iii', 'ii', 'iv', 'bs', 'as', 'sd']);

// "JUAN DE LOS SANTOS" -> "Juan de los Santos"; respeta siglas y codigos con numeros (W2, U601).
export function mayusculasIniciales(s) {
  const texto = String(s || '').replace(/\s+/g, ' ').trim();
  if (!texto) return '';
  let primero = true;
  return texto.split(/(\s+|[/\-(),.]+)/).map(pieza => {
    if (!pieza || /^[\s/\-(),.]+$/.test(pieza)) return pieza;
    const minuscula = pieza.toLocaleLowerCase('es');
    let salida;
    if (/\d/.test(pieza)) salida = pieza.toUpperCase();
    else if (SIGLAS.has(minuscula)) salida = pieza.toUpperCase();
    else if (!primero && MINUSCULAS.has(minuscula)) salida = minuscula;
    else salida = minuscula.charAt(0).toLocaleUpperCase('es') + minuscula.slice(1);
    primero = false;
    return salida;
  }).join('');
}

// Arma el nombre a mostrar: "Edificio - Calle 1234 U601" (partes opcionales).
export function formatearDireccion({ edificio, calle, unidad }) {
  const izquierda = String(edificio || '').trim(), medio = String(calle || '').trim(), u = String(unidad || '').trim();
  const textoUnidad = u ? (/^\d/.test(u) ? `U${u}` : u) : '';
  const derecha = [medio, textoUnidad].filter(Boolean).join(' ');
  if (izquierda && derecha) return medio ? `${izquierda} - ${derecha}` : `${izquierda} ${textoUnidad}`;
  return izquierda || derecha;
}

// Separa texto libre en edificio / calle / unidad / nota. Heuristica: se revisa con reglas.
export function interpretarDireccion(textoOriginal) {
  let s = String(textoOriginal || '').replace(/\s+/g, ' ').trim();
  const notas = [];
  s = s.replace(/\(([^)]*)\)/g, (_, n) => { notas.push(n.trim()); return ' '; });
  s = s.replace(/\b\d\s*(?:D|DORM\w*|DROM\w*)\b\.?/gi, ' ');        // "1 D", "3 DORMITORIOS"
  s = s.replace(/\s+/g, ' ').trim();

  let unidad = '';
  const extra = s.match(/\s*\+\s*([A-Z]+\s*\d+)\s*$/i);                  // "+ GGE6"
  let textoExtra = '';
  if (extra) { textoExtra = ` + ${extra[1].replace(/\s+/g, '').toUpperCase()}`; s = s.slice(0, extra.index).trim(); }

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
  const partes = s.split(/\s+-\s+|\s*,\s*/).map(x => x.trim()).filter(Boolean);
  let edificio = '', calle = '';
  const esCalle = p => /[A-Za-zÁÉÍÓÚáéíóúñÑ.]\s*\d{2,5}\b/.test(p) && !/^\d{1,4}$/.test(p);
  if (partes.length >= 2) {
    const si = partes.findIndex(esCalle);
    if (si > 0) { edificio = partes.slice(0, si).join(' '); calle = partes.slice(si).join(' '); }
    else if (si === 0) { calle = partes[0]; if (partes.length > 1 && /^\d+$/.test(partes[1])) notas.push(partes[1]); else edificio = partes.slice(1).join(' '); }
    else edificio = partes.join(' ');
  } else {
    const p = partes[0] || '';
    // "Torre Ceibo Av. Italia 875" / "Edificio Araza Bv. Artigas 2674": edificio + calle en un mismo tramo.
    const m = p.match(/^(.*?)\s+((?:AV\.?|AVDA\.?|BV\.?|BVAR\.?|DR\.?|RAMBLA|CALLE)\s*.*\d{2,5})$/i)
      || (unidad && p.match(/^([A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})*)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ.]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúñÑ.]+)*\s+\d{3,5})$/));
    if (m && m[1] && !/^\d/.test(m[2])) { edificio = m[1]; calle = m[2]; }
    else if (!unidad) {
      // "TORRE CEIBO 403", "EDIFICIO ARAZA 903": nombre en mayusculas + numero = edificio + unidad.
      const bu = p.match(/^(.*[A-Za-z].*?)\s+(\d{3,4})$/);
      if (bu && p === p.toUpperCase()) { edificio = bu[1]; unidad = bu[2]; }
      else calle = p;
    } else if (esCalle(p)) calle = p;
    else edificio = p;
  }
  if (unidad) unidad += textoExtra; else if (textoExtra) notas.push(textoExtra.trim());
  return {
    edificio: mayusculasIniciales(edificio), calle: mayusculasIniciales(calle), unidad,
    nota: notas.filter(Boolean).map(n => mayusculasIniciales(n)).join('; '),
  };
}
