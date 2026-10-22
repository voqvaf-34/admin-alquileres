// Fechas: lectura (Excel, ISO, dd/mm/aaaa) y formato.

export const MONTH_MAP = {
  ENERO:1, FEBRERO:2, FEBREREREO:2, MARZO:3, ABRIL:4, MAYO:5, JUNIO:6,
  JULIO:7, AGOSTO:8, SETIEMBRE:9, SEPTIEMBRE:9, OCTUBRE:10, NOVIEMBRE:11, DICIEMBRE:12,
};

export const MES_ES = ["","enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","setiembre","octubre","noviembre","diciembre"];

export function excelDate(serial) {
  if (!serial || typeof serial !== "number" || serial < 30000) return null;
  const d = new Date((serial - 25569) * 86400000);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function fmtDate(d) {
  if (!d) return "-";
  return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
}

export function toISODate(d) {
  if (!d) return null;
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

export function parseISO(str) {
  if (!str) return null;
  const p = String(str).split('-');
  if (p.length !== 3) return null;
  const d = new Date(+p[0], +p[1]-1, +p[2]);
  return isNaN(d.getTime()) ? null : d;
}

export function parseDMY(str) {
  if (!str) return null;
  const p = String(str).split('/');
  if (p.length !== 3) return null;
  return new Date(+p[2], +p[1]-1, +p[0]);
}

export function parseMonthYear(str) {
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10) - 1;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  if (month < 0 || month > 11) return null;
  return new Date(year, month, 1);
}
