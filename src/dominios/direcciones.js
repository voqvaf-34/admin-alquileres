// Normaliza la direccion libre de cada contrato a { edificio, calle, unidad } con el
// formato "Edificio - Calle 1234 U601", usando el diccionario de edificios conocidos.
import * as N from './nombres.js';
import { claveNombre } from './texto.js';

function armarIndice(rules) {
  const idx = new Map();
  for (const b of rules.buildings || []) {
    for (const a of [b.nombre, ...(b.alias || [])]) idx.set(claveNombre(a), b);
  }
  return idx;
}

// Si el texto empieza con un edificio conocido ("Torre Ceibo Av. Italia 875"), lo separa.
function separarPrefijoConocido(text, idx) {
  const k = claveNombre(text);
  let best = null;
  for (const [alias, b] of idx) {
    if ((k === alias || k.startsWith(alias + ' ')) && (!best || alias.length > best.alias.length)) best = { alias, b };
  }
  if (!best) return null;
  const words = best.alias.split(' ').length;
  const rest = String(text).trim().split(/\s+/).slice(words).join(' ');
  return { building: best.b, rest };
}

export function normalizarDireccion(raw, rules = {}) {
  const idx = armarIndice(rules);
  const ovKey = claveNombre(raw);
  const ov = Object.entries(rules.overrides || {}).find(([k]) => claveNombre(k) === ovKey);
  let p = N.interpretarDireccion(raw);
  if (ov) p = { ...p, ...ov[1] };

  // Edificio por alias del diccionario.
  if (p.edificio) {
    const hit = idx.get(claveNombre(p.edificio)) || (separarPrefijoConocido(p.edificio, idx) || {}).building;
    if (hit) p.edificio = hit.nombre;
  } else if (p.calle) {
    const s = separarPrefijoConocido(p.calle, idx);
    if (s) {
      p.edificio = s.building.nombre;
      const rest = s.rest.trim();
      if (/^\d{1,4}$/.test(rest) && !p.unidad) { p.unidad = rest; p.calle = ''; }
      else p.calle = rest;
    }
  }
  // La calle del diccionario manda (corrige variantes y completa las que faltan).
  const b = p.edificio && idx.get(claveNombre(p.edificio));
  if (b && b.calle) p.calle = b.calle;
  if (b && !b.calle && p.calle && claveNombre(p.calle) === claveNombre(p.edificio)) p.calle = '';

  const out = {
    edificio: N.mayusculasIniciales(p.edificio) === N.mayusculasIniciales(b ? b.nombre : '') && b ? b.nombre : N.mayusculasIniciales(p.edificio),
    calle: b && b.calle ? b.calle : N.mayusculasIniciales(p.calle),
    unidad: /^\d/.test(String(p.unidad || '')) ? String(p.unidad).toUpperCase().replace(/\s+/g, ' ') : N.mayusculasIniciales(p.unidad),
    nota: p.nota || '',
  };
  out.direccion = N.formatearDireccion(out) || N.mayusculasIniciales(raw);
  return out;
}

