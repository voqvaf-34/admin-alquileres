// Normaliza la direccion libre de cada contrato a { edificio, calle, unidad } con el
// formato "Edificio - Calle 1234 U601", usando el diccionario de edificios conocidos.
import * as N from './nombres.js';
import { claveNombre } from './texto.js';

function armarIndice(reglas) {
  const idx = new Map();
  for (const b of reglas.buildings || []) {
    for (const a of [b.nombre, ...(b.alias || [])]) idx.set(claveNombre(a), b);
  }
  return idx;
}

// Si el texto empieza con un edificio conocido ("Torre Ceibo Av. Italia 875"), lo separa.
function separarPrefijoConocido(texto, idx) {
  const k = claveNombre(texto);
  let mejor = null;
  for (const [alias, b] of idx) {
    if ((k === alias || k.startsWith(alias + ' ')) && (!mejor || alias.length > mejor.alias.length)) mejor = { alias, b };
  }
  if (!mejor) return null;
  const palabras = mejor.alias.split(' ').length;
  const resto = String(texto).trim().split(/\s+/).slice(palabras).join(' ');
  return { building: mejor.b, rest: resto };
}

export function normalizarDireccion(raw, reglas = {}) {
  const idx = armarIndice(reglas);
  const ovKey = claveNombre(raw);
  const ov = Object.entries(reglas.overrides || {}).find(([k]) => claveNombre(k) === ovKey);
  let p = N.interpretarDireccion(raw);
  if (ov) p = { ...p, ...ov[1] };

  // Edificio por alias del diccionario.
  if (p.edificio) {
    const coincidencia = idx.get(claveNombre(p.edificio)) || (separarPrefijoConocido(p.edificio, idx) || {}).building;
    if (coincidencia) p.edificio = coincidencia.nombre;
  } else if (p.calle) {
    const s = separarPrefijoConocido(p.calle, idx);
    if (s) {
      p.edificio = s.building.nombre;
      const resto = s.rest.trim();
      if (/^\d{1,4}$/.test(resto) && !p.unidad) { p.unidad = resto; p.calle = ''; }
      else p.calle = resto;
    }
  }
  // La calle del diccionario manda (corrige variantes y completa las que faltan).
  const b = p.edificio && idx.get(claveNombre(p.edificio));
  if (b && b.calle) p.calle = b.calle;
  if (b && !b.calle && p.calle && claveNombre(p.calle) === claveNombre(p.edificio)) p.calle = '';

  const salida = {
    edificio: N.mayusculasIniciales(p.edificio) === N.mayusculasIniciales(b ? b.nombre : '') && b ? b.nombre : N.mayusculasIniciales(p.edificio),
    calle: b && b.calle ? b.calle : N.mayusculasIniciales(p.calle),
    unidad: /^\d/.test(String(p.unidad || '')) ? String(p.unidad).toUpperCase().replace(/\s+/g, ' ') : N.mayusculasIniciales(p.unidad),
    nota: p.nota || '',
  };
  salida.direccion = N.formatearDireccion(salida) || N.mayusculasIniciales(raw);
  return salida;
}

