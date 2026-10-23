// Datos de ejemplo (todos inventados) para probar la app o mostrarla sin datos reales.
// Las fechas se calculan desde "hoy", asi siempre hay aumentos del mes, renovaciones
// proximas, un vencido sin resolver, delegados, inactivos y un apto ya renovado.
import { fmtDate, toISODate } from './fechas.js';

// Fecha a partir de hoy: anios atras y dias de corrimiento.
const desde = (hoy, anios, dias = 0) => new Date(hoy.getFullYear() - anios, hoy.getMonth(), hoy.getDate() + dias);
// Mismo mes que hoy (o el siguiente), dia fijo, N anios atras.
const enMes = (hoy, anios, dia, masMeses = 0) => new Date(hoy.getFullYear() - anios, hoy.getMonth() + masMeses, dia);

const tel  = n => `091 000 ${String(n).padStart(3, '0')}`;
const mail = nombre => nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.') + '@example.com';

const P = {   // propietarios
  ana:     'Ana Perez',          bruno:  'Bruno Silva',      carla:  'Carla Mendez / Diego Mendez',
  elena:   'Elena Rodriguez',    fede:   'Federico Lopez',   gabi:   'Gabriela Castro',
  hugo:    'Hugo Fernandez',     ines:   'Ines Martinez',    jorge:  'Jorge Alvarez',
  laura:   'Laura Gimenez',      mario:  'Mario Suarez',     nora:   'Nora Pereyra',
};
const telDe = Object.fromEntries(Object.keys(P).map((k, i) => [k, tel(101 + i)]));

const INQ = ['Beto Gomez', 'Camila Ruiz', 'Daniel Sosa', 'Emilia Vidal', 'Facundo Rios', 'Florencia Acosta', 'German Molina',
  'Julieta Romero', 'Lucas Benitez', 'Martina Cabrera', 'Nicolas Ortiz', 'Paula Dominguez', 'Rodrigo Ferreira',
  'Sofia Medina', 'Tomas Herrera', 'Valentina Ramos', 'Agustin Navarro', 'Carolina Rey', 'Matias Pena', 'Lucia Ibarra'];

export function datosDemo(hoy = new Date()) {
  hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let n = 0;
  const C = (direccion, prop, importe, fechaInicio, contratoStr, extra = {}) => {
    const inquilino = INQ[n % INQ.length]; n++;
    return {
      sourceRow: n, direccion, propietario: P[prop], telProp: telDe[prop], mailProp: mail(P[prop].split(' / ')[0]),
      importeBase: importe, importe, moneda: importe < 10000 ? 'USD' : 'UYU', ultimoAumento: null, remitente: '', contratoStr,
      fechaInicio: toISODate(fechaInicio), inquilino, telInq: tel(200 + n), mailInq: mail(inquilino), notas: '', inactive: false,
      ...extra,
    };
  };

  const contracts = [
    // Aumentan este mes (aniversario del inicio).
    C('Torre Ceibo - Av. Italia 2875 U403',        'ana',   28500, enMes(hoy, 1, 5),  '2 AÑOS', { notas: 'Paga por transferencia | Mascota permitida' }),
    C('Torre Ceibo - Av. Italia 2875 U702',        'ana',   31000, enMes(hoy, 2, 12), '3 AÑOS'),
    C('Edificio Araza - Bv. Artigas 1610 U801',    'bruno', 36800, enMes(hoy, 1, 18), '2 AÑOS'),
    C('Canelones 1234 U502',                       'elena', 22400, enMes(hoy, 2, 3),  '3 AÑOS'),
    C('Residencial Guayabo - Guayabo 1850 U3',     'fede',    850, enMes(hoy, 1, 22), '2 AÑOS'),   // en dolares
    // Aumentan el mes que viene.
    C('Mirador del Parque - Av. Rivera 3300 U1201', 'gabi', 42000, enMes(hoy, 1, 8, 1), '2 AÑOS'),
    C('Edificio Araza - Bv. Artigas 1610 U305',    'carla', 27900, enMes(hoy, 2, 15, 1), '3 AÑOS'),
    // Vencen dentro de los proximos 45 dias (contrato a 1 anio = 2 reales).
    C('Torre Ceibo - Av. Italia 2875 U1104',       'hugo',  33500, desde(hoy, 2, 3), '1 AÑO'),
    C('Maldonado 1580 U2',                         'ines',  19800, desde(hoy, 2, 10), '1 AÑO'),
    C('Mirador del Parque - Av. Rivera 3300 U604', 'jorge',  1100, desde(hoy, 3, 7), '2 AÑOS'),    // en dolares
    // Vencido sin resolver.
    C('Residencial Guayabo - Guayabo 1850 U7',     'laura', 24600, desde(hoy, 2, -50), '1 AÑO'),
    // Ya renovado (tiene linea de tiempo): vencio hace unos meses y se renovo por 2 anios.
    C('Edificio Araza - Bv. Artigas 1610 U1002',   'mario', 38900, desde(hoy, 2, -120), '1 AÑO',
      { notas: 'Renovo con aumento por IPC' }),
    // Garantias que gestionan ellas mismas aumentos y renovaciones.
    C('Canelones 1234 U801',                       'nora',  26700, enMes(hoy, 1, 10), '2 AÑOS', { remitente: 'ANDA' }),
    C('Mirador del Parque - Av. Rivera 3300 U902', 'gabi',  35200, enMes(hoy, 2, 25), '2 AÑOS', { remitente: 'CGN' }),
    // Aumentos que maneja otra persona.
    C('Maldonado 1580 U9',                         'elena', 21000, enMes(hoy, 1, 14), '2 AÑOS', { remitente: 'Gestora Norte' }),
    // Resto de la cartera.
    C('Torre Ceibo - Av. Italia 2875 U201',        'bruno', 29900, enMes(hoy, 1, 9, 4),  '2 AÑOS'),
    C('Residencial Guayabo - Guayabo 1850 U12',    'fede',  23800, enMes(hoy, 0, 2, -3), '2 AÑOS'),
    C('Mirador del Parque - Av. Rivera 3300 U1503', 'hugo', 47500, enMes(hoy, 1, 20, 6), '3 AÑOS'),
    C('Canelones 1234 U304',                       'ines',  20500, enMes(hoy, 0, 11, -5), '2 AÑOS'),
    // Inactivos (inquilinos que ya se fueron).
    C('Maldonado 1580 U5',                         'jorge', 18200, desde(hoy, 4, 40), '1 AÑO', { inactive: true }),
    C('Torre Ceibo - Av. Italia 2875 U403',        'ana',   21500, desde(hoy, 4, 5),  '2 AÑOS', { inactive: true }),
  ];

  const admins = [
    { sourceRow: 1, nombre: 'Administración Sur (Laura Gómez)', edificios: 'Torre Ceibo; Edificio Araza', telefono: '2900 0001', mail: 'administracion.sur@example.com' },
    { sourceRow: 2, nombre: 'Gestión Edificios Norte', edificios: 'Mirador del Parque', telefono: '2900 0002 / 091 000 900', mail: 'norte@example.com' },
    { sourceRow: 3, nombre: 'Consorcio Guayabo', edificios: 'Residencial Guayabo', telefono: '2900 0003', mail: 'guayabo@example.com' },
  ];

  // Marca de renovacion del apto ya renovado: nuevo contrato desde el vencimiento, por 2 anios.
  const renovado = contracts.find(c => c.direccion === 'Edificio Araza - Bv. Artigas 1610 U1002');
  const vencio = desde(hoy, 0, -120);
  const marks = {
    [`v|${renovado.direccion}`]: { date: fmtDate(desde(hoy, 0, -125)), nuevaInicio: fmtDate(vencio), renewYears: 2 },
  };

  return { contracts, admins, marks };
}
