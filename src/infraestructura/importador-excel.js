const fs   = require('fs');
const XLSX = require('xlsx');
const D    = require('../dominios/index.js');

function str(v) { return v == null ? "" : String(v).trim(); }

// Replica el parseo de la hoja ALQUILADOS de la app original (filas de cabecera
// de anio/mes, filas de titulos, columna ESTADO = INACTIVO).
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

function readWorkbookFile(filePath) {
  // Lectura a buffer: no bloquea el archivo si Excel lo tiene abierto.
  const buf = fs.readFileSync(filePath);
  const wb  = XLSX.read(buf, { type: 'buffer' });
  const wsC = wb.Sheets["ALQUILADOS"] || wb.Sheets[wb.SheetNames[0]];
  return {
    contracts: parseContractsSheet(wsC),
    admins:    parseAdminSheet(wb.Sheets["ADMINISTRACIONES"]),
  };
}

module.exports = { readWorkbookFile, parseContractsSheet, parseAdminSheet };
