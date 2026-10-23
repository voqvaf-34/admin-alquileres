// Contratos: duracion, garantias, quien gestiona aumentos y armado del registro.
import { parseISO } from './fechas.js';

// Garantias que se encargan ellas mismas de aumentos y renovaciones.
export const GARANTIAS_GESTIONAN = ['CGN', 'ANDA'];

export const GARANTIAS_DEFAULT   = ['CGN', 'ANDA', 'BHU', 'Porto', 'Sura', 'Mapfre'];

// Quien gestiona aumentos/renovaciones si no es la inmobiliaria: la garantia (CGN, ANDA) o un
// tercero cargado en "Aumentos los hace" (remitente). '' = lo hace la inmobiliaria.
export function gestionadoPor(e) {
  if (e.remitente) return e.remitente;
  const g = String(e.garantia || '').trim().toUpperCase();
  return GARANTIAS_GESTIONAN.includes(g) ? g : '';
}

export function parseDuration(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const m = s.match(/\b([123])\b/);
  if (m) return parseInt(m[1],10);
  const m2 = s.match(/([123])/);
  return m2 ? parseInt(m2[1],10) : null;
}

// El contrato firmado a N anios dura N+1 en la practica (1a = 2 reales, 2a = 3).
export function realDuration(y) { return y ? y+1 : null; }

export function hydrateContract(r) {
  return {
    id: r.id,
    direccion: r.direccion,
    propietario: r.propietario || '',
    telProp: r.telProp || '',
    mailProp: r.mailProp || '',
    importeBase: r.importeBase,
    importe: r.importe || r.importeBase,
    ultimoAumento: parseISO(r.ultimoAumento),
    remitente: r.remitente || '',
    garantia: r.garantia || '',
    moneda: r.moneda === 'USD' ? 'USD' : 'UYU',
    contratoStr: r.contratoStr || '',
    edificio: r.edificio || '', calle: r.calle || '', unidad: r.unidad || '',
    direccionOriginal: r.direccionOriginal || '',
    contratoDuracion: parseDuration(r.contratoStr),
    fechaInicio: parseISO(r.fechaInicio),
    inquilino: r.inquilino || '',
    telInq: r.telInq || '',
    mailInq: r.mailInq || '',
    notas: r.notas || '',
    inactive: !!r.inactive,
  };
}

// Reemplaza los campos de texto del propietario por los datos de los propietarios
// vinculados (si los hay) y agrega los contactos de esos propietarios.
export function attachOwners(entries, owners, contacts, links) {
  const oById = new Map((owners || []).map(o => [o.id, o]));
  const cById = new Map((contacts || []).map(c => [c.id, c]));
  const byContract = new Map();
  for (const l of links || []) {
    if (!byContract.has(l.contractId)) byContract.set(l.contractId, []);
    byContract.get(l.contractId).push(l);
  }
  for (const e of entries) {
    if (e.propietarioRaw === undefined) {
      e.propietarioRaw = e.propietario; e.telPropRaw = e.telProp; e.mailPropRaw = e.mailProp;
    }
    const ls = (byContract.get(e.id) || []).slice().sort((a, b) => a.orden - b.orden);
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
  return entries;
}
