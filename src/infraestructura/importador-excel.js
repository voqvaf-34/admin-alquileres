const fs   = require('fs');
const XLSX = require('xlsx');
const D    = require('../dominios/index.js');

function str(v) { return v == null ? "" : String(v).trim(); }

// Importacion desde Excel o CSV. Dos formatos:
// - "plantilla": columnas reconocidas por su encabezado (ver dominios/planilla.js y la planilla modelo)
// - "clasico": columnas por posicion, como la planilla de la app original (hoja ALQUILADOS con
//   filas de anio/mes intercaladas, columna ESTADO = INACTIVO)

const filasDe = ws => (ws && ws['!ref'] ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) : []);

function parseTemplateSheet(ws, columnas, aRegistro) {
  const filas = filasDe(ws);
  const enc = D.detectarEncabezados(filas, columnas);
  if (!enc) return null;
  const out = [];
  for (let r = enc.fila + 1; r < filas.length; r++) {
    const reg = aRegistro(filas[r] || [], enc.columnas, r);
    if (reg) out.push(reg);
  }
  return out;
}

function parseContractsSheet(ws) {
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const out = [];
  let estadoCol = -1;

  for (let c = 0; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({r:0, c})];
    if (cell && String(cell.v).trim().toUpperCase() === "ESTADO") { estadoCol = c; break; }
  }

  for (let r = range.s.r; r <= range.e.r; r++) {
    const g = c => { const cell = ws[XLSX.utils.encode_cell({r, c})]; return cell ? cell.v : null; };
    const a = g(0), b = g(1);
    if (a && typeof a === "number" && a >= 2020 && a <= 2035) continue;
    if (b && typeof b === "string" && D.MONTH_MAP[b.trim().toUpperCase().replace(/\s+/g,"")]) continue;
    if (b && typeof b === "string" && ["MES","DIRECCCION","NUMERO"].includes(b.trim().toUpperCase())) continue;
    if (a && typeof a === "string" && ["NUMERO","MES"].includes(a.trim().toUpperCase())) continue;
    if (!b || typeof b !== "string") continue;
    const importeBase = g(5);
    if (!importeBase || typeof importeBase !== "number") continue;

    const inactive = estadoCol >= 0 && str(g(estadoCol)).toUpperCase() === "INACTIVO";

    // Col G: fecha de ultimo aumento (serial o "MM/AAAA") o "MANDA <persona>" (delegado)
    const ultRaw = g(6);
    let ultimoAumento = null, remitente = "";
    if (typeof ultRaw === "number" && ultRaw > 30000) {
      ultimoAumento = D.excelDate(ultRaw);
    } else if (typeof ultRaw === "string" && ultRaw.trim()) {
      const asDate = D.parseMonthYear(ultRaw);
      if (asDate) ultimoAumento = asDate;
      else remitente = ultRaw.trim().replace(/^(MANDA|ENVIA)\s+/i, "").trim();
    }

    const fechaRaw = g(9);
    let fecha = null;
    if (fechaRaw instanceof Date) fecha = new Date(fechaRaw.getUTCFullYear(), fechaRaw.getUTCMonth(), fechaRaw.getUTCDate());
    else if (typeof fechaRaw === "number") fecha = D.excelDate(fechaRaw);

    out.push({
      sourceRow:     r,
      direccion:     b.trim(),
      propietario:   str(g(2)),
      telProp:       str(g(3)),
      mailProp:      str(g(4)),
      importeBase,
      importe:       D.parseUYAmount(g(7)) || importeBase,
      ultimoAumento: D.toISODate(ultimoAumento),
      remitente,
      contratoStr:   str(g(8)),
      fechaInicio:   D.toISODate(fecha),
      inquilino:     str(g(10)),
      telInq:        str(g(11)),
      mailInq:       str(g(12)),
      notas:         str(g(13)),
      inactive,
    });
  }
  return out;
}

function parseAdminSheet(ws) {
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const out = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const g = c => { const cell = ws[XLSX.utils.encode_cell({r, c})]; return cell ? cell.v : null; };
    const nombreRaw = g(0);
    if (!nombreRaw || typeof nombreRaw !== "string") continue;
    const nombre = nombreRaw.trim();
    if (!nombre || nombre.toUpperCase() === "ADMINISTRACIONES") continue;
    out.push({ sourceRow: r, nombre, edificios: str(g(1)), telefono: str(g(2)), mail: str(g(3)) });
  }
  return out;
}

const hoja = (wb, ...nombres) => {
  const n = wb.SheetNames.find(x => nombres.includes(D.norm(x).trim()));
  return n ? wb.Sheets[n] : null;
};

function readWorkbook(wb) {
  const wsC = hoja(wb, 'alquileres', 'alquilados', 'contratos') || wb.Sheets[wb.SheetNames[0]];
  const wsA = hoja(wb, 'administraciones');
  const contracts = parseTemplateSheet(wsC, D.COLUMNAS_ALQUILERES, D.filaAContrato);
  if (contracts) {
    return { formato: 'plantilla', contracts, admins: parseTemplateSheet(wsA, D.COLUMNAS_ADMINISTRACIONES, D.filaAAdministracion) || [] };
  }
  return { formato: 'clasico', contracts: parseContractsSheet(wsC), admins: parseAdminSheet(wsA) };
}

// Los CSV pueden venir en UTF-8 o en ANSI (Excel en Windows): se detecta para leer bien las tildes.
const esUtf8 = buf => { try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch (_) { return false; } };

function readBuffer(buf) {
  return readWorkbook(XLSX.read(buf, { type: 'buffer', codepage: esUtf8(buf) ? 65001 : 1252 }));
}

function readWorkbookFile(filePath) {
  // Lectura a buffer: no bloquea el archivo si Excel lo tiene abierto.
  return readBuffer(fs.readFileSync(filePath));
}

// Planilla modelo para completar e importar: encabezados, dos filas de ejemplo e instrucciones.
function templateWorkbook() {
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

function writeTemplate(filePath) { XLSX.writeFile(templateWorkbook(), filePath); }

module.exports = { readBuffer, readWorkbook, readWorkbookFile, parseContractsSheet, parseAdminSheet, templateWorkbook, writeTemplate };
