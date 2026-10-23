// Textos que se copian para mandar a inquilinos y propietarios. Cada uno es una plantilla
// editable en Configuracion, con variables entre llaves: {inmobiliaria}, {vencimiento}...
import { formatearFecha } from './fechas.js';
import { leerMarca } from './marca.js';

export const PLANTILLAS = {
  renovacion: {
    clave: 'msgRenovacion',
    titulo: 'Aviso de renovación (al inquilino)',
    variables: ['inmobiliaria', 'vencimiento', 'direccion', 'inquilino', 'propietario'],
    texto: 'Hola! Te escribo desde {inmobiliaria}. Te avisamos que el contrato de arrendamiento vence el {vencimiento}. A partir de esa fecha el contrato ya no tendría vigencia, por lo que si seguís en el apartamento habría que hacer la renovación, de esto nos encargamos nosotros. La renovación se haría en base al ajuste de IPC correspondiente. Te avisamos con anticipación por las dudas. Aguardo tus comentarios!',
  },
  aumentoInquilino: {
    clave: 'msgAumentoInq',
    titulo: 'Aumento (al inquilino)',
    variables: ['inmobiliaria', 'porcentaje', 'nuevo_importe', 'direccion', 'inquilino', 'propietario'],
    texto: 'Hola! Te escribo desde {inmobiliaria}. Este mes corresponde segun el contrato aumento por IPC en el importe de alquiler. El aumento correspondiente es de {porcentaje} quedando en {nuevo_importe} (En caso de ya haber abonado se envia la diferencia directamente a la cuenta donde se paga el alquiler). Cualquier consulta quedo a las ordenes!',
  },
  aumentoPropietario: {
    clave: 'msgAumentoProp',
    titulo: 'Aumento (al propietario)',
    variables: ['inmobiliaria', 'porcentaje', 'nuevo_importe', 'direccion', 'inquilino', 'propietario'],
    texto: 'Hola! Te escribo desde {inmobiliaria}. Este mes corresponde aumento por IPC en el importe de alquiler de {direccion}. El aumento correspondiente es de {porcentaje} quedando en {nuevo_importe} (En caso de que ya hayan abonado el importe deberan depositar la diferencia). El inquilino ya quedo avisado, cualquier consulta quedo a las ordenes!',
  },
};

export const PLANTILLA_MAX = 2000;

// Reemplaza {variable} por su valor; las desconocidas o vacias quedan como estan (se ven y se corrigen).
export function rellenar(texto, datos) {
  return String(texto).replace(/\{([a-z_]+)\}/g, (m, k) => (datos[k] != null && datos[k] !== '' ? String(datos[k]) : m));
}

// Variables usadas en un texto que la plantilla no conoce (para avisar en Configuracion).
export function variablesDesconocidas(id, texto) {
  const ok = new Set(PLANTILLAS[id].variables);
  return [...new Set([...String(texto).matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]))].filter(v => !ok.has(v));
}

export const textoPlantilla = (settings, id) => (settings && settings[PLANTILLAS[id].clave]) || PLANTILLAS[id].texto;

// Valida lo que llega de Configuracion: vacio o igual al original se guarda vacio (= usar el
// original, asi una mejora futura del texto por defecto le llega a quien no lo cambio).
export function mensajesASettings(textos = {}) {
  const out = {};
  for (const [id, p] of Object.entries(PLANTILLAS)) {
    if (!(id in textos)) continue;
    const t = String(textos[id] || '').trim();
    if (t.length > PLANTILLA_MAX) throw new Error(`"${p.titulo}" puede tener hasta ${PLANTILLA_MAX} caracteres.`);
    out[p.clave] = t === p.texto ? '' : t;
  }
  return out;
}

const datosContrato = (settings, e = {}) => ({
  inmobiliaria: leerMarca(settings).nombre,
  direccion: e.direccion || '', inquilino: e.inquilino || '', propietario: e.propietario || '',
});

export function mensajeRenovacion(vencDate, { settings = {}, contrato } = {}) {
  return rellenar(textoPlantilla(settings, 'renovacion'), {
    ...datosContrato(settings, contrato), vencimiento: vencDate ? formatearFecha(vencDate) : '?',
  });
}

// porcentaje y nuevoImporte llegan ya formateados para mostrar ("3,16%", "$ 25.790").
export function mensajesAumento({ settings = {}, contrato, porcentaje, nuevoImporte }) {
  const datos = { ...datosContrato(settings, contrato), porcentaje, nuevo_importe: nuevoImporte };
  return {
    inquilino:   rellenar(textoPlantilla(settings, 'aumentoInquilino'), datos),
    propietario: rellenar(textoPlantilla(settings, 'aumentoPropietario'), datos),
  };
}
