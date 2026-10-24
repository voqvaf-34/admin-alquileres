// Linea de tiempo de un contrato: entro, vencio, renovo...
import { formatearFecha, interpretarDMA } from './fechas.js';
import { duracionReal } from './contratos.js';
import { fechaVencBase } from './vencimientos.js';
import { separarNotas, interpretarNotaRenovacion } from './comentarios.js';

// Contratos agrupados por direccion y ordenados por fecha de inicio. Para recorrer muchos
// contratos (la tabla entera) conviene armarlo una vez y pasarlo en lugar de la lista.
export function indicePorDireccion(contratos) {
  const idx = new Map();
  for (const x of contratos || []) {
    if (!x.fechaInicio) continue;
    if (!idx.has(x.direccion)) idx.set(x.direccion, []);
    idx.get(x.direccion).push(x);
  }
  for (const lista of idx.values()) lista.sort((a, b) => a.fechaInicio - b.fechaInicio);
  return idx;
}

// Renovaciones de un contrato: marcas de renovado (v, vr) + las que quedaron anotadas en
// comentarios. Las marcas se guardan por direccion, asi que solo cuentan las que caen dentro
// del periodo de este contrato (hasta que empieza el siguiente en el mismo apto).
// `all`: todos los contratos, o el indice de indicePorDireccion().
export function renovaciones(e, marcas, todos) {
  marcas = marcas || {};
  const idx = todos instanceof Map ? todos : indicePorDireccion(todos);
  const sig = e.fechaInicio && (idx.get(e.direccion) || []).find(x => x.id !== e.id && x.fechaInicio > e.fechaInicio);
  const desde = e.fechaInicio || new Date(0), hasta = sig ? sig.fechaInicio : null;
  const dentro = d => !!d && d >= desde && (!hasta || d < hasta);
  const salida = [];
  for (const k of ['v', 'vr']) {
    const mk = marcas[`${k}|${e.direccion}`];
    const d = mk && interpretarDMA(mk.fecha);
    if (d && dentro(d)) salida.push({ d, anios: mk.aniosRenovacion || null, inicio: interpretarDMA(mk.nuevaInicio) });
  }
  // Una nota de renovacion es la misma que una marca si su fecha coincide (+-5 dias) con el dia
  // en que se marco o con el nuevo inicio (la app vieja anotaba "01/03/2024 Renovacion 2 años"
  // con la fecha de inicio, y la marca puede haberse cargado meses despues).
  const cerca = (a, b) => !!a && !!b && Math.abs(a - b) <= 5 * 86400000;
  for (const n of separarNotas(e.notas)) {
    const r = interpretarNotaRenovacion(n);
    if (r && !salida.some(x => cerca(x.d, r.fecha) || cerca(x.inicio, r.fecha))) salida.push({ d: r.fecha, anios: r.anios, inicio: null });
  }
  // Orden y fecha que se muestran: cuando empezo cada renovacion (si se sabe), no cuando se marco.
  for (const x of salida) x.fecha = x.inicio || x.d;
  const nr = marcas[`nr|${e.direccion}`];
  return { lista: salida.sort((a, b) => a.fecha - b.fecha), noRenueva: nr && dentro(interpretarDMA(nr.fecha)) ? nr : null };
}

// Linea de tiempo de UN contrato (no del apto): cuando entro y a cuanto, cuando vencio,
// cada renovacion con su nuevo vencimiento, y como sigue. Solo tiene sentido si renovo.
export function lineaTiempo(e, marcas, todos) {
  const { lista, noRenueva } = renovaciones(e, marcas, todos);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dinero = n => (e.moneda === 'USD' ? 'US$ ' : '$') + Math.round(n).toLocaleString('es-UY');
  const masAnios = (d, y) => new Date(d.getFullYear() + y, d.getMonth(), Math.min(d.getDate(), 28));
  // En el orden del contrato: entro (vence X) -> renovo (vence Y) -> renovo de nuevo (vence Z)
  // -> vence / vencio. Cada paso dice hasta cuando quedo el contrato.
  const ev = [];
  const agregar = (fecha, tipo, titulo, detalle) => ev.push({ fecha, tipo, titulo, detalle: detalle || '' });
  const hasta = d => d ? `vence ${formatearFecha(d)}` : '';

  let vence = fechaVencBase(e, {});
  if (e.fechaInicio) {
    const real = duracionReal(e.contratoDuracion);
    agregar(e.fechaInicio, 'inicio', 'Entró al apto',
      [e.importeBase ? `contrato a ${dinero(e.importeBase)}` : '',
       e.contratoTexto ? `${e.contratoTexto} firmado${real ? ` (${real} reales)` : ''}` : '', hasta(vence)].filter(Boolean).join(' · '));
  }
  lista.forEach((r, i) => {
    const desde = r.inicio || vence;
    const nueva = desde && r.anios ? masAnios(desde, r.anios) : null;
    agregar(r.fecha, 'renov', i === 0 ? 'Renovó' : `Renovó de nuevo (${i + 1}ª renovación)`,
      [r.anios ? `por ${r.anios} año${r.anios === 1 ? '' : 's'}` : '', hasta(nueva)].filter(Boolean).join(' · '));
    vence = nueva || null;
  });
  if (noRenueva) agregar(interpretarDMA(noRenueva.fecha), 'norenueva', 'No renueva',
    [noRenueva.descripcion, noRenueva.sigueActivo ? 'sigue en el apto' : ''].filter(Boolean).join(' · '));
  if (vence) agregar(vence, vence >= hoy ? 'proximo' : 'venc', vence >= hoy ? 'Vence el contrato' : 'Venció el contrato');
  if (e.inactivo) agregar(null, 'inactivo', 'Se fue del apto (contrato inactivo)');
  else if (e.importe) agregar(null, 'hoy', 'Hoy', `alquiler actual ${dinero(e.importe)}`);
  return ev;
}
