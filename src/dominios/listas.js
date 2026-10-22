// Campos que guardan varios valores en un mismo texto (co-propietarios, telefonos, mails,
// edificios de una administracion, comentarios): como separarlos respetando los
// separadores que ya aparecen en los datos.
import { splitNotas } from './comentarios.js';

const clean = arr => arr.map(s => s.trim()).filter(s => s && s !== '-');

export const Splitters = {
  // edificios: ";" "," o renglon (un renglon que empieza con numero sigue al anterior: "Maldonado\n1921")
  edificios: s => clean(String(s).replace(/\s*\n\s*(?=\d)/g, ' ').split(/[;\n]|,(?=\s|$)/)),
  // telefonos: ";" "," renglon o barra con espacio de algun lado (no corta fechas 29/10/2025)
  telefonos: s => clean(String(s).split(/[;\n,]|\s*\/{2,}\s*|\s+\/+\s*|\s*\/+\s+/)),
  mails:     s => clean(String(s).split(/[\s;,]+|\s-\s|\/+/)),
  // personas: " / ", "//" o ";" (no corta fechas como 29/10/2025)
  personas:  s => clean(String(s).split(/\s+\/+\s+|\s*\/{2,}\s*|;/)),
  // comentarios: unidos con " | "
  notas:     splitNotas,
};
