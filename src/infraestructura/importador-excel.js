const fs   = require('fs');
const XLSX = require('xlsx');
const D    = require('../dominios/index.js');

function textoLimpio(v) { return v == null ? '' : String(v).trim(); }

// Importacion desde Excel o CSV. Dos formatos:
// - "plantilla": columnas reconocidas por su encabezado (ver dominios/planilla.js y la planilla modelo)
// - "clasico": columnas por posicion, como la planilla de la app original (hoja ALQUILADOS con
//   filas de anio/mes intercaladas, columna ESTADO = INACTIVO)

const filasDe = ws => (ws && ws['!ref'] ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) : []);

function interpretarHojaModelo(ws, columnas, aRegistro) {
  const filas = filasDe(ws);
  const enc = D.detectarEncabezados(filas, columnas);
  if (!enc) return null;
  const salida = [];
  for (let r = enc.fila + 1; r < filas.length; r++) {
    const registro = aRegistro(filas[r] || [], enc.columnas, r);
    if (registro) salida.push(registro);
  }
  return salida;
}

function interpretarHojaContratos(ws) {
  if (!ws || !ws['!ref']) return [];
  const rango = XLSX.utils.decode_range(ws['!ref']);
  const salida = [];
  let estadoCol = -1;

  for (let c = 0; c <= rango.e.c; c++) {
    const celda = ws[XLSX.utils.encode_cell({r:0, c})];
    if (celda && String(celda.v).trim().toUpperCase() === 'ESTADO') { estadoCol = c; break; }
  }

  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const g = c => { const celda = ws[XLSX.utils.encode_cell({r, c})]; return celda ? celda.v : null; };
    const a = g(0), b = g(1);
    if (a && typeof a === 'number' && a >= 2020 && a <= 2035) continue;
    if (b && typeof b === 'string' && D.MAPA_MESES[b.trim().toUpperCase().replace(/\s+/g,'')]) continue;
    if (b && typeof b === 'string' && ['MES','DIRECCCION','NUMERO'].includes(b.trim().toUpperCase())) continue;
    if (a && typeof a === 'string' && ['NUMERO','MES'].includes(a.trim().toUpperCase())) continue;
    if (!b || typeof b !== 'string') continue;
    const importeBase = g(5);
    if (!importeBase || typeof importeBase !== 'number') continue;

    const inactive = estadoCol >= 0 && textoLimpio(g(estadoCol)).toUpperCase() === 'INACTIVO';

    // Col G: fecha de ultimo aumento (serial o "MM/AAAA") o "MANDA <persona>" (delegado)
    const ultRaw = g(6);
    let ultimoAumento = null, remitente = '';
    if (typeof ultRaw === 'number' && ultRaw > 30000) {
      ultimoAumento = D.fechaExcel(ultRaw);
    } else if (typeof ultRaw === 'string' && ultRaw.trim()) {
      const comoFecha = D.interpretarMesAnio(ultRaw);
      if (comoFecha) ultimoAumento = comoFecha;
      else remitente = ultRaw.trim().replace(/^(MANDA|ENVIA)\s+/i, '').trim();
    }

    const fechaRaw = g(9);
    let fecha = null;
    if (fechaRaw instanceof Date) fecha = new Date(fechaRaw.getUTCFullYear(), fechaRaw.getUTCMonth(), fechaRaw.getUTCDate());
    else if (typeof fechaRaw === 'number') fecha = D.fechaExcel(fechaRaw);

    salida.push({
      filaOrigen:     r,
      direccion:     b.trim(),
      propietario:   textoLimpio(g(2)),
      telProp:       textoLimpio(g(3)),
      mailProp:      textoLimpio(g(4)),
      importeBase,
      importe:       D.interpretarImporteUY(g(7)) || importeBase,
      ultimoAumento: D.aFechaISO(ultimoAumento),
      remitente,
      contratoTexto:   textoLimpio(g(8)),
      fechaInicio:   D.aFechaISO(fecha),
      inquilino:     textoLimpio(g(10)),
      telInq:        textoLimpio(g(11)),
      mailInq:       textoLimpio(g(12)),
      notas:         textoLimpio(g(13)),
      inactivo: inactive,
    });
  }
  return salida;
}

function interpretarHojaAdmins(ws) {
  if (!ws || !ws['!ref']) return [];
  const rango = XLSX.utils.decode_range(ws['!ref']);
  const salida = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const g = c => { const celda = ws[XLSX.utils.encode_cell({r, c})]; return celda ? celda.v : null; };
    const nombreRaw = g(0);
    if (!nombreRaw || typeof nombreRaw !== 'string') continue;
    const nombre = nombreRaw.trim();
    if (!nombre || nombre.toUpperCase() === 'ADMINISTRACIONES') continue;
    salida.push({ filaOrigen: r, nombre, edificios: textoLimpio(g(1)), telefono: textoLimpio(g(2)), mail: textoLimpio(g(3)) });
  }
  return salida;
}

const hoja = (wb, ...nombres) => {
  const n = wb.SheetNames.find(x => nombres.includes(D.normalizar(x).trim()));
  return n ? wb.Sheets[n] : null;
};

function leerLibro(wb) {
  const wsC = hoja(wb, 'alquileres', 'alquilados', 'contratos') || wb.Sheets[wb.SheetNames[0]];
  const wsA = hoja(wb, 'administraciones');
  const contratos = interpretarHojaModelo(wsC, D.COLUMNAS_ALQUILERES, D.filaAContrato);
  if (contratos) {
    return { formato: 'plantilla', contratos, administraciones: interpretarHojaModelo(wsA, D.COLUMNAS_ADMINISTRACIONES, D.filaAAdministracion) || [] };
  }
  return { formato: 'clasico', contratos: interpretarHojaContratos(wsC), administraciones: interpretarHojaAdmins(wsA) };
}

// Los CSV pueden venir en UTF-8 o en ANSI (Excel en Windows): se detecta para leer bien las tildes.
const esUtf8 = buf => { try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch (_) { return false; } };

function leerBuffer(buf) {
  return leerLibro(XLSX.read(buf, { type: 'buffer', codepage: esUtf8(buf) ? 65001 : 1252 }));
}

function leerArchivoLibro(rutaArchivo) {
  // Lectura a buffer: no bloquea el archivo si Excel lo tiene abierto.
  return leerBuffer(fs.readFileSync(rutaArchivo));
}

// Planilla modelo para completar e importar: encabezados, dos filas de ejemplo e instrucciones.
function libroModelo() {
  const wb = XLSX.utils.book_new();
  const cols = D.COLUMNAS_ALQUILERES;
  const filas = [cols.map(c => c.titulo), ...D.EJEMPLO_PLANILLA.map(e => cols.map(c => e[c.campo] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = cols.map(c => ({ wch: Math.max(14, c.titulo.length + 2, c.campo === 'direccion' ? 36 : 0) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Alquileres');
  const adm = XLSX.utils.aoa_to_sheet([D.COLUMNAS_ADMINISTRACIONES.map(c => c.titulo),
    ['Administración Sur (Laura Gómez)', 'Torre Ceibo; Edificio Araza', '2900 0001', 'administracion.sur@example.com']]);
  adm['!cols'] = [{ wch: 34 }, { wch: 30 }, { wch: 16 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, adm, 'Administraciones');
  const ins = XLSX.utils.aoa_to_sheet([
    ['Cómo completar esta planilla'],
    [''],
    ['• Una fila por contrato. Las filas de ejemplo se pueden borrar.'],
    ['• Obligatorias: Dirección y Alquiler actual. El resto se puede dejar vacío.'],
    ['• Las columnas pueden estar en cualquier orden; se reconocen por el encabezado.'],
    ['• Fechas: dd/mm/aaaa (o formato fecha de Excel). Último aumento puede ser mm/aaaa.'],
    ['• Moneda: UYU (pesos) o USD (dólares). Vacío = pesos.'],
    ['• Duración del contrato: "1 año", "2 años"...'],
    ['• Varios propietarios: separarlos con " / ".'],
    ['• Estado: Activo o Inactivo (contratos terminados). Vacío = activo.'],
    ['• Aumentos los hace: vacío si los hace la inmobiliaria; si no, quién los gestiona.'],
  ]);
  ins['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ins, 'Instrucciones');
  return wb;
}

function escribirModelo(rutaArchivo) { XLSX.writeFile(libroModelo(), rutaArchivo); }

module.exports = { leerBuffer, leerLibro, leerArchivoLibro, libroModelo, escribirModelo };
