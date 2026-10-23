// Campos que guardan varios valores en un mismo texto (co-propietarios, telefonos, mails,
// edificios de una administracion, comentarios): como separarlos respetando los
// separadores que ya aparecen en los datos.
import { separarNotas } from './comentarios.js';

const limpiarLista = arr => arr.map(s => s.trim()).filter(s => s && s !== '-');

export const Separadores = {
  // edificios: ";" "," o renglon (un renglon que empieza con numero sigue al anterior: "Maldonado\n1921")
  edificios: s => limpiarLista(String(s).replace(/\s*\n\s*(?=\d)/g, ' ').split(/[;\n]|,(?=\s|$)/)),
  // telefonos: ";" "," renglon o barra con espacio de algun lado (no corta fechas 29/10/2025)
  telefonos: s => limpiarLista(String(s).split(/[;\n,]|\s*\/{2,}\s*|\s+\/+\s*|\s*\/+\s+/)),
  mails:     s => limpiarLista(String(s).split(/[\s;,]+|\s-\s|\/+/)),
  // personas: " / ", "//" o ";" (no corta fechas como 29/10/2025)
  personas:  s => limpiarLista(String(s).split(/\s+\/+\s+|\s*\/{2,}\s*|;/)),
  // comentarios: unidos con " | "
  notas:     separarNotas,
};
