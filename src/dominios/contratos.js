// Contratos: duracion, garantias, quien gestiona aumentos, armado del registro y normalizacion
// de lo que se carga a mano o se importa.
import { normalizarDireccion } from './direcciones.js';
import { interpretarISO } from './fechas.js';
import { formatearDireccion, mayusculasIniciales } from './nombres.js';

// Garantias que se encargan ellas mismas de aumentos y renovaciones.
export const GARANTIAS_GESTIONAN = ['CGN', 'ANDA'];

export const GARANTIAS_PREDETERMINADAS   = ['CGN', 'ANDA', 'BHU', 'Porto', 'Sura', 'Mapfre'];

// Quien gestiona aumentos/renovaciones si no es la inmobiliaria: la garantia (CGN, ANDA) o un
// tercero cargado en "Aumentos los hace" (remitente). '' = lo hace la inmobiliaria.
export function gestionadoPor(e) {
  if (e.remitente) return e.remitente;
  const g = String(e.garantia || '').trim().toUpperCase();
  return GARANTIAS_GESTIONAN.includes(g) ? g : '';
}

export function interpretarDuracion(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const m = s.match(/\b([123])\b/);
  if (m) return parseInt(m[1],10);
  const m2 = s.match(/([123])/);
  return m2 ? parseInt(m2[1],10) : null;
}

// El contrato firmado a N anios dura N+1 en la practica (1a = 2 reales, 2a = 3).
export function duracionReal(y) { return y ? y+1 : null; }

export function hidratarContrato(r) {
  return {
    id: r.id,
    direccion: r.direccion,
    propietario: r.propietario || '',
    telProp: r.telProp || '',
    mailProp: r.mailProp || '',
    importeBase: r.importeBase,
    importe: r.importe || r.importeBase,
    ultimoAumento: interpretarISO(r.ultimoAumento),
    remitente: r.remitente || '',
    garantia: r.garantia || '',
    moneda: r.moneda === 'USD' ? 'USD' : 'UYU',
    contratoStr: r.contratoStr || '',
    edificio: r.edificio || '', calle: r.calle || '', unidad: r.unidad || '',
    direccionOriginal: r.direccionOriginal || '',
    contratoDuracion: interpretarDuracion(r.contratoStr),
    fechaInicio: interpretarISO(r.fechaInicio),
    inquilino: r.inquilino || '',
    telInq: r.telInq || '',
    mailInq: r.mailInq || '',
    notas: r.notas || '',
    inactive: !!r.inactive,
  };
}

// Reemplaza los campos de texto del propietario por los datos de los propietarios
// vinculados (si los hay) y agrega los contactos de esos propietarios.
export function adjuntarPropietarios(entradas, propietarios, contactos, enlaces) {
  const oById = new Map((propietarios || []).map(o => [o.id, o]));
  const cById = new Map((contactos || []).map(c => [c.id, c]));
  const porContrato = new Map();
  for (const l of enlaces || []) {
    if (!porContrato.has(l.contractId)) porContrato.set(l.contractId, []);
    porContrato.get(l.contractId).push(l);
  }
  for (const e of entradas) {
    if (e.propietarioRaw === undefined) {
      e.propietarioRaw = e.propietario; e.telPropRaw = e.telProp; e.mailPropRaw = e.mailProp;
    }
    const ls = (porContrato.get(e.id) || []).slice().sort((a, b) => a.orden - b.orden);
    e.owners = ls.map(l => oById.get(l.ownerId)).filter(Boolean);
    if (e.owners.length) {
      e.propietario = e.owners.map(o => o.nombre).join(' / ');
      e.telProp     = e.owners.map(o => o.telefono).filter(Boolean).join(' / ');
      e.mailProp    = e.owners.map(o => o.mail).filter(Boolean).join(' / ');
    } else {
      e.propietario = e.propietarioRaw; e.telProp = e.telPropRaw; e.mailProp = e.mailPropRaw;
    }
    const cs = new Map();
    for (const o of e.owners) if (o.contactId && cById.has(o.contactId)) cs.set(o.contactId, cById.get(o.contactId));
    e.contacts = [...cs.values()];
  }
  return entradas;
}

// Unidad: los numeros en mayusculas ("4B"), los nombres con mayusculas iniciales ("Local Frente").
const formatoUnidad = u => (/^\d/.test(String(u || '').trim()) ? String(u).trim().toUpperCase() : mayusculasIniciales(u));

// Alquiler cargado a mano: direccion armada con "Edificio - Calle 1234 U601", nombres con mayusculas
// iniciales y copropietarios separados por " / ". propietario null = no se toca (edicion parcial).
export function normalizarContrato(c) {
  const edificio = mayusculasIniciales(c.edificio), calle = mayusculasIniciales(c.calle), unidad = formatoUnidad(c.unidad);
  const direccion = formatearDireccion({ edificio, calle, unidad }) || mayusculasIniciales(c.direccion);
  const propietario = c.propietario == null ? null
    : String(c.propietario).split(/\s*\/{1,}\s*/).filter(Boolean).map(mayusculasIniciales).join(' / ');
  return { ...c, edificio, calle, unidad, direccion, inquilino: mayusculasIniciales(c.inquilino), propietario };
}

// Una fila importada para sumar a lo que ya hay: mismo formato que un alquiler cargado a mano
// (direccion normalizada con las reglas de direcciones) y garantias CGN/ANDA en su campo.
// En la planilla clasica (sin moneda) los importes de hasta 4 cifras son dolares.
export function prepararImportado(c, { reglasDirecciones, clasico = false } = {}) {
  const a = normalizarDireccion(c.direccion, reglasDirecciones);
  const x = normalizarContrato({ ...c, edificio: a.edificio, calle: a.calle, unidad: a.unidad, direccionOriginal: c.direccion });
  let garantia = String(c.garantia || '').trim(), remitente = String(c.remitente || '').trim();
  if (!garantia && GARANTIAS_GESTIONAN.includes(remitente.toUpperCase())) { garantia = remitente.toUpperCase(); remitente = ''; }
  const moneda = c.moneda || (clasico && c.importe > 0 && c.importe < 10000 ? 'USD' : 'UYU');
  return { ...x, garantia, remitente: mayusculasIniciales(remitente), moneda };
}
