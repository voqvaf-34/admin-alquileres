// Importacion desde una planilla con encabezados (Excel o CSV): que columna es cada dato.
// Los encabezados se reconocen sin importar mayusculas, tildes ni el orden de las columnas.
import { fechaExcel, interpretarDMA, interpretarMesAnio, aFechaISO } from './fechas.js';
import { interpretarImporteUY } from './importes.js';
import { normalizar } from './texto.js';

// campo: dato del contrato; titulo: encabezado de la planilla modelo; alias: otros nombres aceptados.
export const COLUMNAS_ALQUILERES = [
  { campo: 'direccion',     titulo: 'Dirección',              alias: ['direccion', 'domicilio', 'inmueble', 'apartamento', 'apto', 'propiedad'], obligatoria: true },
  { campo: 'propietario',   titulo: 'Propietario',            alias: ['propietario', 'propietarios', 'dueno', 'duenos'] },
  { campo: 'telProp',       titulo: 'Teléfono propietario',   alias: ['telefono propietario', 'tel propietario', 'celular propietario', 'tel prop'] },
  { campo: 'mailProp',      titulo: 'Mail propietario',       alias: ['mail propietario', 'email propietario', 'correo propietario', 'mail prop'] },
  { campo: 'importe',       titulo: 'Alquiler actual',        alias: ['alquiler actual', 'importe actual', 'alquiler', 'importe', 'precio', 'monto'], obligatoria: true },
  { campo: 'importeBase',   titulo: 'Alquiler inicial',       alias: ['alquiler inicial', 'importe inicial', 'importe base', 'precio inicial'] },
  { campo: 'moneda',        titulo: 'Moneda',                 alias: ['moneda'] },
  { campo: 'fechaInicio',   titulo: 'Fecha de inicio',        alias: ['fecha de inicio', 'fecha inicio', 'inicio', 'inicio contrato', 'desde'] },
  { campo: 'contratoStr',   titulo: 'Duración del contrato',  alias: ['duracion del contrato', 'duracion contrato', 'duracion', 'plazo', 'contrato'] },
  { campo: 'ultimoAumento', titulo: 'Último aumento',         alias: ['ultimo aumento', 'fecha ultimo aumento', 'ult aumento'] },
  { campo: 'inquilino',     titulo: 'Inquilino',              alias: ['inquilino', 'inquilinos', 'arrendatario'] },
  { campo: 'telInq',        titulo: 'Teléfono inquilino',     alias: ['telefono inquilino', 'tel inquilino', 'celular inquilino', 'tel inq'] },
  { campo: 'mailInq',       titulo: 'Mail inquilino',         alias: ['mail inquilino', 'email inquilino', 'correo inquilino', 'mail inq'] },
  { campo: 'garantia',      titulo: 'Garantía',               alias: ['garantia', 'tipo de garantia'] },
  { campo: 'remitente',     titulo: 'Aumentos los hace',      alias: ['aumentos los hace', 'gestiona aumentos', 'quien hace los aumentos'] },
  { campo: 'estado',        titulo: 'Estado',                 alias: ['estado', 'activo'] },
  { campo: 'notas',         titulo: 'Comentarios',            alias: ['comentarios', 'comentario', 'notas', 'nota', 'observaciones'] },
];

export const COLUMNAS_ADMINISTRACIONES = [
  { campo: 'nombre',    titulo: 'Administración', alias: ['administracion', 'nombre', 'empresa'], obligatoria: true },
  { campo: 'edificios', titulo: 'Edificios',      alias: ['edificios', 'edificio'] },
  { campo: 'telefono',  titulo: 'Teléfono',       alias: ['telefono', 'telefonos', 'tel'] },
  { campo: 'mail',      titulo: 'Mail',           alias: ['mail', 'mails', 'email', 'correo'] },
];

const limpiarTitulo = v => normalizar(String(v ?? '')).replace(/[^a-z0-9]+/g, ' ').trim();

// Busca la fila de encabezados (entre las primeras 10) y devuelve { fila, columnas: {campo: indice} }
// o null si no hay una fila con todas las columnas obligatorias.
export function detectarEncabezados(filas, columnas = COLUMNAS_ALQUILERES) {
  for (let r = 0; r < Math.min(filas.length, 10); r++) {
    const mapa = {};
    (filas[r] || []).forEach((v, c) => {
      const t = limpiarTitulo(v);
      if (!t) return;
      const col = columnas.find(k => !(k.campo in mapa) && k.alias.includes(t));
      if (col) mapa[col.campo] = c;
    });
    if (columnas.filter(k => k.obligatoria).every(k => k.campo in mapa)) return { fila: r, columnas: mapa };
  }
  return null;
}

const texto = v => (v == null ? '' : v instanceof Date ? aFechaISO(v) : String(v).trim());

// Fecha desde Excel (numero de serie o Date) o texto "dd/mm/aaaa", "aaaa-mm-dd", "mm/aaaa".
export function leerFecha(v) {
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number') return fechaExcel(v);
  const s = texto(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return interpretarDMA(`${m[1]}/${m[2]}/${m[3].length === 2 ? '20' + m[3] : m[3]}`);
  return interpretarMesAnio(s);
}

export function leerMoneda(v) {
  const s = normalizar(texto(v)).replace(/[\s.]/g, '');
  if (!s) return '';
  return /^(usd|us\$|u\$s|u\$d|dolar|dolares|uss)$/.test(s) ? 'USD' : 'UYU';
}

const INACTIVO = /^(inactivo|inactiva|no|baja|finalizado|terminado)$/;

// Una fila de la planilla -> contrato listo para importar. null si la fila esta vacia o no tiene importe.
export function filaAContrato(fila, columnas, filaOrigen) {
  const get = campo => (campo in columnas ? fila[columnas[campo]] : null);
  const direccion = texto(get('direccion'));
  const importe = interpretarImporteUY(get('importe'));
  if (!direccion || !importe) return null;
  const inicial = interpretarImporteUY(get('importeBase'));
  return {
    sourceRow: filaOrigen,
    direccion,
    propietario:   texto(get('propietario')),
    telProp:       texto(get('telProp')),
    mailProp:      texto(get('mailProp')),
    importeBase:   inicial || importe,
    importe,
    moneda:        leerMoneda(get('moneda')),
    ultimoAumento: aFechaISO(leerFecha(get('ultimoAumento'))),
    remitente:     texto(get('remitente')),
    garantia:      texto(get('garantia')),
    contratoStr:   texto(get('contratoStr')),
    fechaInicio:   aFechaISO(leerFecha(get('fechaInicio'))),
    inquilino:     texto(get('inquilino')),
    telInq:        texto(get('telInq')),
    mailInq:       texto(get('mailInq')),
    notas:         texto(get('notas')),
    inactive:      INACTIVO.test(normalizar(texto(get('estado')))),
  };
}

export function filaAAdministracion(fila, columnas, filaOrigen) {
  const get = campo => (campo in columnas ? texto(fila[columnas[campo]]) : '');
  const nombre = get('nombre');
  return nombre ? { sourceRow: filaOrigen, nombre, edificios: get('edificios'), telefono: get('telefono'), mail: get('mail') } : null;
}

// Filas de ejemplo para la planilla modelo (inventadas).
export const EJEMPLO_PLANILLA = [
  { direccion: 'Torre Ceibo - Av. Italia 2875 U403', propietario: 'Ana Perez', telProp: '091 000 101', mailProp: 'ana.perez@example.com',
    importe: 29400, importeBase: 28500, moneda: 'UYU', fechaInicio: '05/03/2025', contratoStr: '2 años', ultimoAumento: '',
    inquilino: 'Beto Gomez', telInq: '091 000 201', mailInq: 'beto.gomez@example.com', garantia: 'Porto', remitente: '', estado: 'Activo', notas: 'Paga por transferencia' },
  { direccion: 'Canelones 1234 U502', propietario: 'Carla Mendez / Diego Mendez', telProp: '091 000 103', mailProp: '',
    importe: 850, importeBase: 800, moneda: 'USD', fechaInicio: '20/11/2024', contratoStr: '1 año', ultimoAumento: '11/2025',
    inquilino: 'Camila Ruiz', telInq: '091 000 202', mailInq: '', garantia: 'ANDA', remitente: '', estado: 'Activo', notas: '' },
];
