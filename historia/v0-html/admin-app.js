// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const STATIC_PATH   = '\\\\SERVIDOR\\Compartida\\Alquileres\\planilla.xlsm';
const _SERVER_EXCEL = 'http://localhost:7890/excel';

const MONTH_MAP = {
  ENERO:1,FEBRERO:2,FEBREREREO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,
  JULIO:7,AGOSTO:8,SETIEMBRE:9,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12,
};
const MONTH_NAMES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ─── STATE ───────────────────────────────────────────────────────────────────
let entries     = null;
let ipc         = 3.16;
let selMonth    = new Date().getMonth() + 1;
let selYear     = new Date().getFullYear();
let activeTab   = "basedatos";
let fileName    = "";
let pendingVenc   = null;
let pendingNoAum  = null;   // naKey activo mientras se espera descripcion de "no aumenta"
let pendingNoRen  = null;   // dir activo mientras se espera descripcion de "no renueva"

// Filtros operativos (aumentos / vencimientos)
let opShowSinResolver = false;
let opShowResuelto    = false;

// Base de datos
let editingEntry    = null;   // entry que se esta editando (null = alta nueva)
let dbSearchText    = "";
let dbFilterYear    = 0;
let dbFilterMonth   = 0;
let dbShowActive    = true;
let dbShowInactive  = false;
let expandedRows  = new Set();   // dirs actualmente expandidas en DB

// Administraciones
let admins           = null;
let adminSearchText  = "";
let adminEditRow     = null;  // _row de la administracion en edicion (null = alta nueva)

// Write-back via servidor local (launcher.ps1)
let workbook        = null;   // XLSX workbook en memoria (con VBA)
let serverAvailable = false;  // true cuando los datos vienen del servidor local

// ─── MARKS ───────────────────────────────────────────────────────────────────
const MARKS_KEY = 'admin_alquileres_marks';
let marks = {};
function loadMarks()   { try { marks = JSON.parse(localStorage.getItem(MARKS_KEY)||'{}'); } catch(_){marks={};} }
function saveMarks()   { try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); } catch(_){} }
function aumKey(e,m,y) { return `a|${e.direccion}|${m}|${y}`; }
function vncKey(e)     { return `v|${e.direccion}`; }   // ciclo original
function vncKeyR(e)    { return `vr|${e.direccion}`; }  // ciclo post-renovacion
function naKey(e,m,y)  { return `na|${e.direccion}|${m}|${y}`; }  // no-aumenta
function nrKey(e)      { return `nr|${e.direccion}`; }             // no-renueva
loadMarks();

// ─── TOAST ───────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.innerHTML = msg;
  el.className  = 'show ' + (type||'');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 3800);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function excelDate(serial) {
  if (!serial || typeof serial !== "number" || serial < 30000) return null;
  const d = new Date((serial - 25569) * 86400000);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function fmtDate(d) {
  if (!d) return "-";
  return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
}
function fmtMoney(n) { return "$"+Math.round(n).toLocaleString("es-UY"); }
function parseMonthYear(str) {
  const m = str.trim().match(/^(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10) - 1;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  if (month < 0 || month > 11) return null;
  return new Date(year, month, 1);
}
function parseUYAmount(v) {
  if (typeof v === "number") return v > 0 ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$\s.]/g, '').replace(',', '.'));
    return isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
function parseDuration(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const m = s.match(/\b([123])\b/);
  if (m) return parseInt(m[1],10);
  const m2 = s.match(/([123])/);
  return m2 ? parseInt(m2[1],10) : null;
}
function realDuration(y) { return y ? y+1 : null; }
function norm(s) {
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
}
function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function parseDMY(str) {
  if (!str) return null;
  const p = str.split('/');
  if (p.length !== 3) return null;
  return new Date(+p[2], +p[1]-1, +p[0]);
}
function parseISO(str) {
  if (!str) return null;
  const p = str.split('-');
  return new Date(+p[0], +p[1]-1, +p[2]);
}
// Convierte fecha a serial de Excel
function dateToSerial(d) {
  return Math.round(d.getTime() / 86400000 + 25569);
}

// ─── PARSE SHEET ─────────────────────────────────────────────────────────────
function parseSheet(ws) {
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const result = [];
  let curYear = null, curMonth = null;
  let estadoCol = -1;

  for (let c = 0; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({r:0,c})];
    if (cell && String(cell.v).trim().toUpperCase() === "ESTADO") { estadoCol = c; break; }
  }

  for (let r = range.s.r; r <= range.e.r; r++) {
    const g = c => { const cell = ws[XLSX.utils.encode_cell({r,c})]; return cell ? cell.v : null; };
    const a = g(0), b = g(1);
    if (a && typeof a === "number" && a >= 2020 && a <= 2035) { curYear = a; continue; }
    if (b && typeof b === "string") {
      const key = b.trim().toUpperCase().replace(/\s+/g,"");
      if (MONTH_MAP[key]) { curMonth = MONTH_MAP[key]; continue; }
    }
    if (b && typeof b === "string" && ["MES","DIRECCCION","NUMERO"].includes(b.trim().toUpperCase())) continue;
    if (a && typeof a === "string" && ["NUMERO","MES"].includes(a.trim().toUpperCase())) continue;
    const dir = b;
    if (!dir || typeof dir !== "string") continue;
    const importeBase = g(5);
    if (!importeBase || typeof importeBase !== "number") continue;

    let inactive = false;
    if (estadoCol >= 0) {
      const est = g(estadoCol);
      if (est && String(est).trim().toUpperCase() === "INACTIVO") inactive = true;
    }

    const ultimoAumRaw = g(6);
    let ultimoAumento = null;
    let remitente = "";
    if (typeof ultimoAumRaw === "number" && ultimoAumRaw > 30000) {
      ultimoAumento = excelDate(ultimoAumRaw);
    } else if (typeof ultimoAumRaw === "string" && ultimoAumRaw.trim()) {
      const str = ultimoAumRaw.trim();
      const asDate = parseMonthYear(str);
      if (asDate) {
        ultimoAumento = asDate;
      } else {
        remitente = str.replace(/^(MANDA|ENVIA)\s+/i, "").trim();
      }
    }

    const importe = parseUYAmount(g(7)) || importeBase;

    const fechaRaw = g(9);
    let fecha = null;
    if (fechaRaw instanceof Date) {
      fecha = new Date(fechaRaw.getUTCFullYear(), fechaRaw.getUTCMonth(), fechaRaw.getUTCDate());
    } else if (typeof fechaRaw === "number") {
      fecha = excelDate(fechaRaw);
    }

    const contrRaw = g(8);
    // Col N (indice 13) = columna exclusiva de comentarios
    const notasRaw = g(13);
    const notas = notasRaw ? String(notasRaw).trim() : "";

    result.push({
      _row: r,                             // indice de fila en la hoja (para write-back)
      year:curYear, month:curMonth,
      direccion:dir.trim(),
      propietario: g(2)?String(g(2)).trim():"",
      telProp:     g(3)?String(g(3)).trim():"",
      mailProp:    g(4)?String(g(4)).trim():"",
      importe,
      contratoDuracion:parseDuration(contrRaw),
      contratoStr:contrRaw?String(contrRaw).trim():"",
      fechaInicio:fecha,
      ultimoAumento,
      remitente,
      inquilino:   g(10)?String(g(10)).trim():"",
      telInq:      g(11)?String(g(11)).trim():"",
      mailInq:     g(12)?String(g(12)).trim():"",
      notas,
      inactive,
    });
  }
  return result;
}

// ─── PARSE HOJA ADMINISTRACIONES ──────────────────────────────────────────────
// Columnas: A=Administracion  B=Edificios administrados  C=Telefonos  D=Mail
function parseAdminSheet(ws) {
  if (!ws || !ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const result = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const g = c => { const cell = ws[XLSX.utils.encode_cell({r,c})]; return cell ? cell.v : null; };
    const nombreRaw = g(0);
    if (!nombreRaw || typeof nombreRaw !== "string") continue;
    const nombre = nombreRaw.trim();
    if (!nombre || nombre.toUpperCase() === "ADMINISTRACIONES") continue;
    result.push({
      _row: r,
      nombre,
      edificios: g(1) != null ? String(g(1)).trim() : "",
      telefono:  g(2) != null ? String(g(2)).trim() : "",
      mail:      g(3) != null ? String(g(3)).trim() : "",
    });
  }
  return result;
}

// ─── FILTERS (operativo) ──────────────────────────────────────────────────────
function getAumentos(list, m, y) {
  return list.filter(e => {
    if (e.inactive)  return false;
    if (e.remitente) return false;   // delegado: nos encargamos nosotros
    if (!e.fechaInicio) return false;
    if (e.ultimoAumento) {
      if (e.ultimoAumento.getMonth() + 1 !== m) return false;
      return e.ultimoAumento.getFullYear() + 1 <= y;
    }
    if (e.fechaInicio.getMonth() + 1 !== m) return false;
    if (e.fechaInicio.getFullYear() >= y) return false;
    return e.fechaInicio.getFullYear() + 1 <= y;
  });
}

// Devuelve la fecha de vencimiento efectiva para un contrato.
// Si fue renovado (mark con nuevaInicio+renewYears) usa la fecha post-renovacion.
function getVencDate(e) {
  const mk = marks[vncKey(e)];
  if (mk && mk.nuevaInicio && mk.renewYears) {
    const ni = parseDMY(mk.nuevaInicio);
    if (ni) return new Date(ni.getFullYear() + mk.renewYears, ni.getMonth(), Math.min(ni.getDate(), 28));
  }
  if (!e.fechaInicio || !e.contratoDuracion) return null;
  const real = realDuration(e.contratoDuracion);
  return new Date(e.fechaInicio.getFullYear() + real, e.fechaInicio.getMonth(), e.fechaInicio.getDate());
}

function getVencimientos(list, m, y) {
  const selDate = new Date(y, m - 1, 1);
  const horizon = new Date(+selDate + 45 * 86400000); // +45 días
  return list.filter(e => {
    if (e.inactive)  return false;
    if (e.remitente) return false;
    const vd = getVencDate(e);
    if (!vd) return false;
    return vd >= selDate && vd <= horizon;
  });
}

function getVencidosAtrasados(list, m, y) {
  const selDate = new Date(y, m - 1, 1);
  return list.filter(e => {
    if (e.inactive)      return false;
    if (e.remitente)     return false;
    if (marks[nrKey(e)]) return false;  // ya marcado no-renueva
    if (marks[vncKey(e)]) return false; // ya fue renovado (primer ciclo)
    const vd = getVencDate(e);
    if (!vd) return false;
    return vd < selDate;
  });
}

function monthsAgo(date) {
  const now = new Date();
  const diff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  if (diff >= 24) return `hace ${Math.floor(diff/12)} años`;
  if (diff >= 12) return `hace 1 año`;
  return `hace ${diff} mes${diff !== 1 ? 'es' : ''}`;
}

// ─── FILTRO BASE DE DATOS ─────────────────────────────────────────────────────
function getDBFiltered() {
  if (!entries) return [];
  // ninguno seleccionado = mostrar todos; uno seleccionado = filtrar
  let list = (!dbShowActive && !dbShowInactive)
    ? entries
    : entries.filter(e => e.inactive ? dbShowInactive : dbShowActive);
  if (dbFilterYear > 0)
    list = list.filter(e => e.fechaInicio && e.fechaInicio.getFullYear() === dbFilterYear);
  if (dbFilterMonth > 0)
    list = list.filter(e => e.fechaInicio && e.fechaInicio.getMonth() + 1 === dbFilterMonth);
  if (dbSearchText.trim()) {
    const q = norm(dbSearchText);
    list = list.filter(e =>
      norm(e.direccion).includes(q) ||
      norm(e.propietario).includes(q) ||
      norm(e.inquilino).includes(q) ||
      (e.telProp||'').includes(q) ||
      (e.telInq||'').includes(q) ||
      norm(e.mailProp).includes(q) ||
      norm(e.mailInq).includes(q)
    );
  }
  return list;
}

// ─── RENDER BASE DE DATOS ─────────────────────────────────────────────────────

// Genera la fila separadora de grupo
function dbSepRow(label, count) {
  return `<tr class="db-sep-row">
    <td colspan="5">
      <div class="db-sep-inner">
        <span class="db-sep-label">${label}</span>
        <span class="db-sep-line"></span>
        <span class="db-sep-count">${count}</span>
      </div>
    </td>
  </tr>`;
}

function renderDBTable() {
  if (!entries) return;
  const filtered = getDBFiltered();
  // Ordenar cronologicamente por fecha de inicio (null al final)
  const sorted = filtered.slice().sort((a, b) => {
    const fa = a.fechaInicio ? a.fechaInicio.getTime() : Infinity;
    const fb = b.fechaInicio ? b.fechaInicio.getTime() : Infinity;
    return fa - fb;
  });

  const countEl = document.getElementById('db-count');
  if (countEl) countEl.textContent = `${sorted.length} / ${entries.length} registros`;

  const tbody = document.getElementById('db-tbody');
  if (!tbody) return;

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Sin registros que coincidan.</td></tr>`;
    return;
  }

  // ── Logica de agrupacion ──
  // Sin filtros        -> agrupar por ANO de inicio
  // Filtro solo ano    -> agrupar por MES dentro de ese ano
  // Filtro solo mes    -> agrupar por ANO (solo meses coincidentes)
  // Filtro ano + mes   -> sin separadores
  const hasYear  = dbFilterYear  > 0;
  const hasMes   = dbFilterMonth > 0;
  let groupBy = 'none';
  if      (!hasYear && !hasMes) groupBy = 'year';
  else if ( hasYear && !hasMes) groupBy = 'month';
  else if (!hasYear &&  hasMes) groupBy = 'year';
  // hasYear && hasMes -> 'none'

  // Pre-calcular tamanos de grupo para el contador
  const groupCount = new Map();
  if (groupBy !== 'none') {
    for (const e of sorted) {
      const k = groupKey(e, groupBy);
      groupCount.set(k, (groupCount.get(k) || 0) + 1);
    }
  }

  function groupKey(e, mode) {
    if (!e.fechaInicio) return '__sin_fecha__';
    return mode === 'year'
      ? String(e.fechaInicio.getFullYear())
      : String(e.fechaInicio.getMonth()); // 0-11
  }
  function groupLabel(key, mode) {
    if (key === '__sin_fecha__') return 'Sin fecha';
    return mode === 'year' ? key : MONTH_NAMES[+key + 1];
  }

  let html = '';
  let lastKey = Symbol(); // garantiza que el primer grupo siempre inserta separador

  for (const e of sorted) {
    const dir  = esc(e.direccion);
    const isExp = expandedRows.has(e.direccion);

    // ── separador de grupo ──
    if (groupBy !== 'none') {
      const k = groupKey(e, groupBy);
      if (k !== lastKey) {
        lastKey = k;
        const lbl = groupLabel(k, groupBy);
        const cnt = groupCount.get(k) || 0;
        html += dbSepRow(lbl, cnt + (cnt === 1 ? ' contrato' : ' contratos'));
      }
    }

    // ── fila principal ──
    html += `<tr class="db-row${isExp ? ' expanded' : ''}${e.inactive ? ' db-row-inactive' : ''}" data-dir="${dir}">
      <td class="db-dir">${dir}${e.inactive ? `<span class="inactive-badge">INACTIVO</span>` : ''}${e.remitente ? `<span class="delegado-badge" style="margin-left:8px;font-size:10px">&#8618; ${esc(e.remitente)}</span>` : ''}</td>
      <td>${esc(e.propietario||'-')}</td>
      <td>${esc(e.inquilino||'-')}</td>
      <td style="white-space:nowrap;opacity:0.7">${fmtDate(e.fechaInicio)}</td>
      <td class="db-chevron">&#9658;</td>
    </tr>`;

    // ── fila de detalle (acordeon) ──
    const xlNota = serverAvailable
      ? `<span class="nota-hint">&#128196; Se guardara en Excel al confirmar</span>`
      : `<span class="nota-hint">Inicia el launcher para guardar en el archivo</span>`;
    html += `<tr class="db-detail-row" data-detail-dir="${dir}" style="${isExp ? '' : 'display:none'}">
      <td colspan="5">
        <div class="db-detail-inner">
          <div class="db-detail-grid">
            <div><span class="lbl">Alquiler: </span><strong>${fmtMoney(e.importe)}</strong></div>
            <div><span class="lbl">Ult. aumento: </span>${e.ultimoAumento ? fmtDate(e.ultimoAumento) : '<span style="opacity:0.35">-</span>'}</div>
            <div><span class="lbl">Contrato: </span>${esc(e.contratoStr||'-')}</div>
            ${e.propietario ? `<div><span class="lbl">Propietario: </span>${esc(e.propietario)}</div>` : ''}
            <div><span class="lbl">Tel. Prop: </span>${telLink(e.telProp)}</div>
            ${e.mailProp ? `<div><span class="lbl">Mail Prop: </span><span class="mail-val">${esc(e.mailProp)}</span></div>` : ''}
            ${e.inquilino ? `<div><span class="lbl">Inquilino: </span>${esc(e.inquilino)}</div>` : ''}
            <div><span class="lbl">Tel. Inq: </span>${telLink(e.telInq)}</div>
            ${e.mailInq ? `<div><span class="lbl">Mail Inq: </span><span class="mail-val">${esc(e.mailInq)}</span></div>` : ''}
          </div>
          ${(() => {
            // Badge de renovacion (si existe mark del contrato)
            const mkV  = marks[vncKey(e)];
            const mkVR = marks[vncKeyR(e)];
            let renewBadge = '';
            if (mkVR) {
              renewBadge = `<div style="margin-top:8px;padding:5px 10px;background:rgba(129,199,132,0.07);border-radius:4px;font-size:11px;color:var(--green);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span>&#10003; 2a renovacion el ${mkVR.date}${mkVR.nuevaInicio ? ` &middot; Nuevo inicio: ${mkVR.nuevaInicio} &middot; ${mkVR.renewYears}a` : ''}</span>
                <button class="unmark-btn" data-db-vunc-r="${dir}" title="Desmarcar 2a renovacion" style="margin-left:auto">&times;</button>
              </div>`;
            } else if (mkV) {
              // Calcular si el vencimiento original ya paso para mostrar aviso
              let vencNote = '';
              if (mkV.nuevaInicio && mkV.renewYears) {
                const ni = parseDMY(mkV.nuevaInicio);
                if (ni) {
                  const nvDate = new Date(ni.getFullYear()+mkV.renewYears, ni.getMonth(), Math.min(ni.getDate(),28));
                  if (nvDate <= new Date()) {
                    vencNote = `<span style="color:var(--amber);opacity:0.8"> &middot; &#9888; Venc. renovacion: ${fmtDate(nvDate)}</span>`;
                  }
                }
              }
              renewBadge = `<div style="margin-top:8px;padding:5px 10px;background:rgba(129,199,132,0.07);border-radius:4px;font-size:11px;color:var(--green);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span>&#10003; Renovado el ${mkV.date}${mkV.nuevaInicio ? ` &middot; Inicio: ${mkV.nuevaInicio} &middot; ${mkV.renewYears}a` : ''}${vencNote}</span>
                <button class="unmark-btn" data-db-vunc="${dir}" title="Desmarcar renovacion" style="margin-left:auto">&times;</button>
              </div>`;
            }
            return renewBadge;
          })()}
          <div class="nota-edit-section">
            <span class="nota-label">Comentarios (col N)</span>
            <textarea class="nota-textarea" rows="2">${esc(e.notas)}</textarea>
            <div class="nota-actions">
              <button class="nota-save-btn" data-nota-row="${e._row}">Guardar comentario</button>
              ${xlNota}
            </div>
          </div>
          <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <button class="mark-btn" data-edit-row="${e._row}"
              style="font-size:11px;border-color:rgba(79,195,247,0.2);color:rgba(79,195,247,0.6)">
              &#9998; Editar datos
            </button>
            ${!e.inactive ? `<button class="mark-btn" data-delete-row="${e._row}" data-delete-dir="${dir}"
              style="border-color:rgba(239,83,80,0.2);color:rgba(239,83,80,0.55);font-size:11px">
              &#8855; Marcar como inactivo
            </button>` : ''}
          </div>
        </div>
      </td>
    </tr>`;
  }

  tbody.innerHTML = html;
}

// Inicializa el dropdown de anos del panel DB con los anos en entries
function populateDBYears() {
  const sel = document.getElementById('db-year');
  if (!sel || !entries) return;
  const years = [...new Set(
    entries.filter(e => e.fechaInicio).map(e => e.fechaInicio.getFullYear())
  )].sort();
  // Limpiar y repoblar (conservar "Todos")
  sel.innerHTML = '<option value="0">Todos</option>';
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === dbFilterYear) o.selected = true;
    sel.appendChild(o);
  });
}

// ─── RENDER ADMINISTRACIONES ──────────────────────────────────────────────────
function getAdminFiltered() {
  if (!admins) return [];
  if (!adminSearchText.trim()) return admins;
  const q = norm(adminSearchText);
  return admins.filter(a =>
    norm(a.nombre).includes(q) ||
    norm(a.edificios).includes(q) ||
    norm(a.telefono).includes(q) ||
    norm(a.mail).includes(q)
  );
}

function renderAdminTable() {
  if (!admins) return;
  const filtered = getAdminFiltered();
  const countEl = document.getElementById('admin-count');
  if (countEl) countEl.textContent = `${filtered.length} / ${admins.length} administraciones`;

  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Sin resultados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr data-admin-row="${a._row}">
      <td style="font-weight:600">${esc(a.nombre)}</td>
      <td>${fmtEdificios(a.edificios)}</td>
      <td>${linkPhonesInText(a.telefono)}</td>
      <td>${linkMailsInText(a.mail)}</td>
      <td style="white-space:nowrap;text-align:right">
        <button class="unmark-btn" data-admin-edit="${a._row}" title="Editar">&#9998;</button>
        <button class="unmark-btn" data-admin-del="${a._row}" title="Eliminar">&times;</button>
      </td>
    </tr>`).join('');
}

// ─── AGREGAR / EDITAR / ELIMINAR ADMINISTRACION ───────────────────────────────
function showAdminModal(entry) {
  adminEditRow = entry ? entry._row : null;
  document.getElementById('modal-admin-title').textContent = entry ? 'Editar Administracion' : 'Nueva Administracion';
  document.getElementById('m-adm-nombre').value    = entry ? entry.nombre    : '';
  document.getElementById('m-adm-edificios').value = entry ? entry.edificios : '';
  document.getElementById('m-adm-telefono').value  = entry ? entry.telefono  : '';
  document.getElementById('m-adm-mail').value      = entry ? entry.mail      : '';
  const btn = document.getElementById('modal-admin-submit');
  btn.disabled = false;
  btn.textContent = 'Guardar';
  document.getElementById('modal-admin').classList.add('open');
  setTimeout(() => document.getElementById('m-adm-nombre').focus(), 80);
}

function hideAdminModal() {
  document.getElementById('modal-admin').classList.remove('open');
}

async function submitAdminEntry() {
  const nombre = (document.getElementById('m-adm-nombre').value || '').trim();
  if (!nombre) { showToast('El nombre de la administracion es obligatorio.', 'err'); return; }
  if (!serverAvailable) { showToast('Necesitas el launcher activo para guardar administraciones.', 'err'); return; }

  const payload = {
    action:    adminEditRow !== null ? 'update' : 'add',
    row:       adminEditRow,
    nombre,
    edificios: (document.getElementById('m-adm-edificios').value || '').trim(),
    telefono:  (document.getElementById('m-adm-telefono').value  || '').trim(),
    mail:      (document.getElementById('m-adm-mail').value      || '').trim(),
  };

  const btn = document.getElementById('modal-admin-submit');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    const resp = await fetch('http://localhost:7890/admin-save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (resp.ok) {
      showToast('&#10003; Administracion guardada', 'ok');
      hideAdminModal();
      const ok = await reloadFromServer();
      if (!ok) showToast('No se pudo recargar la lista. Reinicia el launcher.', 'info');
    } else {
      const msg = await resp.text().catch(() => 'Error desconocido');
      showToast('Error: ' + msg, 'err');
      btn.disabled    = false;
      btn.textContent = 'Guardar';
    }
  } catch(err) {
    showToast('No se pudo contactar el servidor.', 'err');
    btn.disabled    = false;
    btn.textContent = 'Guardar';
  }
}

async function deleteAdminEntry(rowIdx, nombre) {
  if (!serverAvailable) { showToast('Necesitas el launcher activo para eliminar.', 'err'); return; }
  if (!confirm(`Eliminar "${nombre}"?`)) return;

  try {
    const resp = await fetch('http://localhost:7890/admin-save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', row: rowIdx }),
    });
    if (resp.ok) {
      showToast('&#10003; Administracion eliminada', 'ok');
      admins = admins.filter(a => a._row !== rowIdx);
      renderAdminTable();
      reloadFromServer(); // sincronizar en background
    } else {
      const msg = await resp.text().catch(() => 'Error desconocido');
      showToast('Error: ' + msg, 'err');
    }
  } catch {
    showToast('No se pudo contactar el servidor.', 'err');
  }
}

// ─── WRITE-BACK via servidor local (launcher.ps1) ────────────────────────────

function updateWriteBtn() {
  const btn = document.getElementById('btn-write');
  if (!btn) return;
  if (serverAvailable) {
    btn.textContent = '✓ Guardado automatico';
    btn.classList.add('connected');
    btn.title = 'Los cambios se guardan en el Excel directamente a traves del servidor local';
    btn.style.cursor = 'default';
  } else {
    btn.textContent = 'Sin servidor';
    btn.classList.remove('connected');
    btn.title = 'Archivo cargado manualmente -- los cambios solo se guardan localmente en el navegador';
    btn.style.opacity = '0.3';
    btn.style.cursor  = 'default';
  }
}

// Envia un array de cambios [{r, c, v}] al endpoint /save del servidor.
// PowerShell aplica cada celda con Excel COM -> el formato del archivo queda intacto.
async function saveToServer(changes) {
  if (!serverAvailable) {
    showToast('Sin servidor activo -- cambios guardados solo en navegador.', 'info');
    return false;
  }
  try {
    const resp = await fetch('http://localhost:7890/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(changes),
    });
    if (resp.ok) return true;
    const msg = await resp.text().catch(() => 'Error desconocido');
    if (msg.includes('utilizado') || msg.includes('used by another') || msg.includes('lock')) {
      showToast('El Excel esta abierto en otra PC. Pedile que lo cierre para guardar.', 'err');
    } else {
      showToast('Error al guardar: ' + msg, 'err');
    }
    return false;
  } catch(err) {
    showToast('No se pudo contactar el servidor. Esta el launcher corriendo?', 'err');
    return false;
  }
}

// Escribe el aumento en Excel: col G (idx 6) = "MM/AAAA", col H (idx 7) = nuevo importe
async function saveIncreaseToExcel(entry, newAmount, date) {
  const dateStr = String(date.getMonth()+1).padStart(2,'0') + '/' + date.getFullYear();
  const ok = await saveToServer([
    { r: entry._row, c: 6, v: dateStr   },
    { r: entry._row, c: 7, v: newAmount },
  ]);
  if (ok) {
    entry.ultimoAumento = date;
    entry.importe       = newAmount;
    showToast('&#10003; Aumento guardado en Excel', 'ok');
  }
  return ok;
}

// Concatena texto de renovacion en col N (idx 13), preservando lo que ya habia
async function saveRenewalToExcel(entry, newStartDate, years, comment) {
  let txt = `En fecha ${fmtDate(new Date())} se renovo a ${years} año${years!==1?'s':''}`;
  if (comment) txt += ` | ${comment}`;
  const prev = entry.notas ? entry.notas.trim() : '';
  const val  = prev ? prev + ' | ' + txt : txt;
  const ok   = await saveToServer([{ r: entry._row, c: 13, v: val }]);
  if (ok) { entry.notas = val; showToast('&#10003; Renovacion guardada en Excel', 'ok'); }
  return ok;
}

// Escribe/borra el comentario de col N (idx 13) para una entrada
async function saveCommentToExcel(entry, text) {
  const ok = await saveToServer([{ r: entry._row, c: 13, v: text.trim() || '' }]);
  if (ok) { entry.notas = text.trim(); showToast('&#10003; Comentario guardado en Excel', 'ok'); }
  return ok;
}

// ─── CLIPBOARD ───────────────────────────────────────────────────────────────
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
}
function fmtIPC(v) { return v.toFixed(2).replace('.', ',') + '%'; }
function toWaPhone(digits) {
  if (digits.length < 7) return null;
  if (/^(598|54|55|351|34)/.test(digits)) return digits;
  if (digits.startsWith('0')) return '598' + digits.slice(1);
  return '598' + digits;
}
function telLink(raw) {
  if (!raw || /^[-xX\s]*$/.test(raw)) return `<span style="opacity:0.35">-</span>`;
  return raw.split('/').map(part => {
    part = part.trim();
    if (!part || /^[-xX\s]*$/.test(part)) return '';
    const digits = part.replace(/\D/g, '');
    const phone  = toWaPhone(digits);
    if (!phone) return `<span class="tel">${esc(part)}</span>`;
    return `<a class="wa" href="https://wa.me/${phone}" target="_blank" rel="noopener">${esc(part)}</a>`;
  }).filter(Boolean).join(' <span style="opacity:0.2">/</span> ');
}

// Texto libre de telefonos (admin.) -- detecta secuencias de digitos y las
// convierte en links de WhatsApp, preservando el resto del texto (etiquetas, separadores)
function linkPhonesInText(raw) {
  if (!raw) return `<span style="opacity:0.35">-</span>`;
  return esc(raw).replace(/\d[\d\s]{6,}\d/g, m => {
    const digits = m.replace(/\D/g, '');
    const phone  = toWaPhone(digits);
    if (!phone) return m;
    return `<a class="wa" href="https://wa.me/${phone}" target="_blank" rel="noopener">${m}</a>`;
  });
}

// Texto libre de mails (admin.) -- detecta tokens con "@" y los vuelve mailto:
function linkMailsInText(raw) {
  if (!raw) return `<span style="opacity:0.35">-</span>`;
  return esc(raw).split(/([\s;,]+)/).map(tok =>
    tok.includes('@') ? `<a class="mail-val" href="mailto:${tok}" style="text-decoration:underline">${tok}</a>` : tok
  ).join('');
}

// Lista de edificios (admin.) separados por ; o salto de linea
function fmtEdificios(raw) {
  if (!raw) return `<span style="opacity:0.35">-</span>`;
  return raw.split(/;|\n/).map(s => s.trim()).filter(Boolean).map(esc)
    .join(' <span style="opacity:0.25">&middot;</span> ');
}

// ─── RESUELTO HELPERS ────────────────────────────────────────────────────────

function isAumentoResuelto(e, m, y) {
  return !!(marks[aumKey(e, m, y)] || marks[naKey(e, m, y)]);
}

function isVencResuelto(e) {
  const mk = marks[vncKey(e)];
  const isRenCycle = !!(mk && mk.nuevaInicio && mk.renewYears);
  return !!(isRenCycle ? marks[vncKeyR(e)] : mk) || !!marks[nrKey(e)];
}

function cardAumentoCompact(e, m, y) {
  const key  = aumKey(e, m, y);
  const mk   = marks[key];
  const naKy = naKey(e, m, y);
  const naMk = marks[naKy];
  if (mk) {
    return `<div class="card card-compact" style="border-left:3px solid var(--green)">
      <div class="card-compact-row">
        <label class="chk-wrap done" style="margin:0;flex:1;min-width:0">
          <input type="checkbox" class="chk" data-aum="${esc(key)}" checked>
          <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.direccion)}</span>
        </label>
        <span style="font-size:11px;opacity:0.5;white-space:nowrap">&#10003; Enviado ${mk.date}</span>
      </div>
    </div>`;
  }
  if (naMk) {
    return `<div class="card card-compact" style="border-left:3px solid rgba(150,150,150,0.3)">
      <div class="card-compact-row">
        <span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.direccion)}</span>
        <span style="font-size:11px;opacity:0.5;white-space:nowrap">&#10005; No aumenta${naMk.desc ? ' &mdash; ' + esc(naMk.desc) : ''} &middot; ${naMk.date}</span>
        <button class="unmark-btn" data-un-na="${esc(naKy)}" title="Deshacer">&#8617;</button>
      </div>
    </div>`;
  }
  return '';
}

function cardVencCompact(e) {
  const mk = marks[vncKey(e)];
  const isRenCycle = !!(mk && mk.nuevaInicio && mk.renewYears);
  const activeMk = isRenCycle ? marks[vncKeyR(e)] : mk;
  const nrMk = marks[nrKey(e)];
  if (activeMk) {
    const undoAttr = isRenCycle ? `data-un-ren-r="${esc(e.direccion)}"` : `data-un-ren="${esc(e.direccion)}"`;
    return `<div class="card card-compact" style="border-left:3px solid var(--green)">
      <div class="card-compact-row">
        <span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.direccion)}</span>
        <span style="font-size:11px;opacity:0.5;white-space:nowrap">&#10003; Renovado ${activeMk.date}${activeMk.nuevaInicio ? ' &middot; ' + activeMk.nuevaInicio + ' &middot; ' + activeMk.renewYears + 'a' : ''}</span>
        <button class="unmark-btn" ${undoAttr} title="Deshacer">&#8617;</button>
      </div>
    </div>`;
  }
  if (nrMk) {
    return `<div class="card card-compact" style="border-left:3px solid rgba(150,150,150,0.3)">
      <div class="card-compact-row">
        <span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.direccion)}</span>
        <span style="font-size:11px;opacity:0.5;white-space:nowrap">&#10005; No renueva${nrMk.desc ? ' &mdash; ' + esc(nrMk.desc) : ''} &middot; ${nrMk.date}</span>
        <button class="unmark-btn" data-un-nr="${esc(e.direccion)}" title="Deshacer">&#8617;</button>
      </div>
    </div>`;
  }
  return '';
}

// ─── FOOTERS ─────────────────────────────────────────────────────────────────
function footerAumento(e, m, y, ipcVal) {
  const nuevo    = Math.floor(e.importe * (1 + ipcVal/100));
  const key      = aumKey(e, m, y);
  const naKy     = naKey(e, m, y);
  const mk       = marks[key];
  const naMk     = marks[naKy];
  const ipcStr   = fmtIPC(ipcVal);
  const nuevoStr = fmtMoney(nuevo);

  if (e.remitente) {
    return `<div class="card-footer">
      <span class="delegado-badge">Delegado &rarr; ${esc(e.remitente)}</span>
      <span style="font-size:11px;opacity:0.35">Excluido de cola personal</span>
    </div>`;
  }

  const msgInq  = `Hola! Te escribo desde Inmobiliaria del Sur. Este mes corresponde segun el contrato aumento por IPC en el importe de alquiler. El aumento correspondiente es de ${ipcStr} quedando en ${nuevoStr} (En caso de ya haber abonado se envia la diferencia directamente a la cuenta donde se paga el alquiler). Cualquier consulta quedo a las ordenes!`;
  const msgProp = `Hola! Te escribo desde Inmobiliaria del Sur. Este mes corresponde aumento por IPC en el importe de alquiler de ${e.direccion}. El aumento correspondiente es de ${ipcStr} quedando en ${nuevoStr} (En caso de que ya hayan abonado el importe deberan depositar la diferencia). El inquilino ya quedo avisado, cualquier consulta quedo a las ordenes!`;

  const xlHint = serverAvailable
    ? `<span class="xl-saved" title="Guardara en Excel al marcar">&#128196; xl</span>`
    : `<span class="xl-pending" title="Inicia el launcher para guardar en Excel">xl?</span>`;

  const copyBtns = `
    <button class="copy-btn" data-copy="${esc(msgInq)}"  title="Copiar mensaje inquilino">&#8663; Inq</button>
    <button class="copy-btn" data-copy="${esc(msgProp)}" title="Copiar mensaje propietario">&#8663; Prop</button>`;

  // Ya enviado
  if (mk) {
    return `<div class="card-footer">
      <label class="chk-wrap done">
        <input type="checkbox" class="chk" data-aum="${esc(key)}" checked>
        Enviado ${mk.date}${mk.xlSaved ? ' &middot; <span class="xl-saved">guardado en xl</span>' : ''}
      </label>
      <span class="change-tag">${fmtMoney(e.importe)} &rarr; ${nuevoStr}</span>
      ${copyBtns}
    </div>`;
  }

  // Marcado como "no aumenta"
  if (naMk) {
    return `<div class="card-footer">
      <span style="font-size:12px;opacity:0.55">&#10005; No aumenta${naMk.desc ? ' &mdash; ' + esc(naMk.desc) : ''} <span style="font-size:10px;opacity:0.45">${naMk.date}</span></span>
      <button class="unmark-btn" data-un-na="${esc(naKy)}" title="Deshacer" style="font-size:14px">&#8617;</button>
    </div>`;
  }

  // Esperando descripcion de "no aumenta"
  if (pendingNoAum === naKy) {
    return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="inp-na-desc" placeholder="Descripcion (opcional, se guarda en comentarios)" class="date-inp" style="flex:1;min-width:160px">
      <button class="mark-btn" data-na-conf="${esc(naKy)}">&#10003; Confirmar</button>
      <button class="mark-btn" data-na-cancel style="opacity:0.5">&#10005;</button>
    </div>`;
  }

  // Estado normal
  return `<div class="card-footer">
    <label class="chk-wrap">
      <input type="checkbox" class="chk" data-aum="${esc(key)}">
      Marcar enviado
    </label>
    ${xlHint}
    <button class="mark-btn" data-na-start="${esc(naKy)}" style="opacity:0.55;font-size:11px;border-color:rgba(239,83,80,0.2);color:rgba(239,83,80,0.6)">&#10005; No aumenta</button>
    ${copyBtns}
  </div>`;
}

// Genera el bloque de inputs de fecha + plazo para una renovacion pendiente
function _vencInputs(defaultYears, confirmAttr, dirEsc) {
  return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
    <span style="font-size:11px;opacity:0.5">Inicio:</span>
    <input type="date" id="inp-venc-date" class="date-inp">
    <span style="font-size:11px;opacity:0.5">Plazo:</span>
    <select id="inp-venc-years" class="date-inp" style="width:auto">
      <option value="1"${defaultYears===1?' selected':''}>1 año</option>
      <option value="2"${defaultYears===2?' selected':''}>2 años</option>
      <option value="3"${defaultYears===3?' selected':''}>3 años</option>
      <option value="4"${defaultYears===4?' selected':''}>4 años</option>
    </select>
    <input type="text" id="inp-venc-desc" placeholder="Comentario (opcional)" class="date-inp" style="flex:1;min-width:140px">
    <button class="mark-btn" ${confirmAttr}="${dirEsc}">&#10003; Confirmar</button>
    <button class="mark-btn" data-vcancel>&#10005;</button>
  </div>`;
}

function footerVenc(e) {
  const mk          = marks[vncKey(e)];
  const isRenCycle  = !!(mk && mk.nuevaInicio && mk.renewYears); // ya fue renovado -> ciclo post-renovacion
  const mkR         = marks[vncKeyR(e)];                          // mark del ciclo post-renovacion

  // ── CICLO POST-RENOVACION ─────────────────────────────────────────────────
  if (isRenCycle) {
    const xlNoteR = mkR && mkR.xlSaved ? ' <span class="xl-saved">&middot; xl</span>' : '';
    if (mkR) {
      // Ya se marco la segunda renovacion
      const renewYearsR = mkR.renewYears || 2;
      let nuevaInfoR = "";
      if (mkR.nuevaInicio) {
        const ni2 = parseDMY(mkR.nuevaInicio);
        if (ni2) {
          const nv2 = new Date(ni2.getFullYear() + renewYearsR, ni2.getMonth(), Math.min(ni2.getDate(), 28));
          nuevaInfoR = `<span class="change-tag">${mk.renewYears}a &rarr; ${renewYearsR}a &middot; Nuevo venc: ${fmtDate(nv2)}</span>`;
        }
      }
      return `<div class="card-footer">
        <span class="venc-done-label">&#10003; Renovado ${mkR.date}${xlNoteR}</span>
        ${nuevaInfoR}
        <span style="font-size:10px;opacity:0.3">1er ciclo: ${mk.date}</span>
        <button class="unmark-btn" data-vunc-r="${esc(e.direccion)}" title="Desmarcar renovacion">&times;</button>
      </div>`;
    }
    // Pendiente de confirmar ciclo post-renovacion
    if (pendingVenc === 'R:' + e.direccion) {
      return _vencInputs(mk.renewYears || 2, 'data-vconf-r', esc(e.direccion));
    }
    // Mostrar historial de 1er renovacion + boton para marcar 2da
    const ni = parseDMY(mk.nuevaInicio);
    const nvDate = ni ? fmtDate(new Date(ni.getFullYear()+mk.renewYears, ni.getMonth(), Math.min(ni.getDate(),28))) : '-';
    return `<div class="card-footer" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="font-size:11px;color:var(--amber);opacity:0.75">
        Renovado el ${mk.date} &middot; Inicio: ${mk.nuevaInicio} &middot; ${mk.renewYears}a &middot; Vence: ${nvDate}
      </div>
      <div style="display:flex;gap:8px">
        <button class="mark-btn" data-vstart-r="${esc(e.direccion)}">Marcar renovado</button>
        <button class="unmark-btn" style="font-size:11px;opacity:0.4;border:1px solid rgba(255,255,255,0.1);padding:2px 8px;border-radius:4px" data-vunc="${esc(e.direccion)}" title="Deshacer 1er renovacion">&#8617; Deshacer</button>
      </div>
    </div>`;
  }

  // ── CICLO ORIGINAL ─────────────────────────────────────────────────────────
  if (mk) {
    const renewYears = mk.renewYears || realDuration(e.contratoDuracion) || 2;
    let nuevaInfo = "";
    if (mk.nuevaInicio) {
      const ni = parseDMY(mk.nuevaInicio);
      if (ni) {
        const nv = new Date(ni.getFullYear() + renewYears, ni.getMonth(), Math.min(ni.getDate(), 28));
        nuevaInfo = `<span class="change-tag">Inicio: ${mk.nuevaInicio} &middot; ${renewYears}a &middot; Prox.venc: ${fmtDate(nv)}</span>`;
      }
    }
    const xlNote = mk.xlSaved ? ' <span class="xl-saved">&middot; xl</span>' : '';
    return `<div class="card-footer">
      <span class="venc-done-label">&#10003; Renovado ${mk.date}${xlNote}</span>
      ${nuevaInfo}
      <button class="unmark-btn" data-vunc="${esc(e.direccion)}" title="Desmarcar">&times;</button>
    </div>`;
  }

  // ── NO RENUEVA ──────────────────────────────────────────────────────────────
  const nrMk = marks[nrKey(e)];
  if (nrMk) {
    return `<div class="card-footer">
      <span style="font-size:12px;opacity:0.55">&#10005; No renueva${nrMk.desc ? ' &mdash; ' + esc(nrMk.desc) : ''} <span style="font-size:10px;opacity:0.45">${nrMk.date}</span></span>
      <button class="unmark-btn" data-un-nr="${esc(e.direccion)}" title="Deshacer" style="font-size:14px">&#8617;</button>
    </div>`;
  }

  if (pendingNoRen === e.direccion) {
    return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="inp-nr-desc" placeholder="Descripcion (opcional, se guarda en comentarios)" class="date-inp" style="flex:1;min-width:160px">
      <button class="mark-btn" data-nr-conf="${esc(e.direccion)}">&#10003; Confirmar</button>
      <button class="mark-btn" data-nr-cancel style="opacity:0.5">&#10005;</button>
    </div>`;
  }

  const defaultYears = realDuration(e.contratoDuracion) || 2;
  if (pendingVenc === e.direccion) {
    return _vencInputs(defaultYears, 'data-vconf', esc(e.direccion));
  }

  return `<div class="card-footer">
    <button class="mark-btn" data-vstart="${esc(e.direccion)}">Marcar renovado</button>
    <button class="mark-btn" data-nr-start="${esc(e.direccion)}" style="opacity:0.55;font-size:11px;border-color:rgba(239,83,80,0.2);color:rgba(239,83,80,0.6)">&#10005; No renueva</button>
  </div>`;
}

function vencRenewalMsg(e) {
  const vd = getVencDate(e);
  const fecha = vd ? fmtDate(vd) : '?';
  return `Hola! Te escribo desde Inmobiliaria del Sur. Te avisamos que el contrato de arrendamiento vence el ${fecha}. A partir de esa fecha el contrato ya no tendría vigencia, por lo que si seguís en el apartamento habría que hacer la renovación, de esto nos encargamos nosotros. La renovación se haría en base al ajuste de IPC correspondiente. Te avisamos con anticipación por las dudas. Aguardo tus comentarios!`;
}

// ─── CARDS ───────────────────────────────────────────────────────────────────
function cardAumento(e, m, y, ipcVal) {
  const mult   = 1 + ipcVal/100;
  const nuevo  = Math.floor(e.importe * mult);
  const diff   = nuevo - e.importe;
  const years  = y - e.fechaInicio.getFullYear();
  const cardKey = aumKey(e, m, y);
  const mk     = marks[cardKey];
  const naMk   = marks[naKey(e, m, y)];
  const isDel  = Boolean(e.remitente);
  const borderColor = mk ? "var(--green)" : naMk ? "rgba(150,150,150,0.3)" : isDel ? "var(--amber)" : e.notas ? "var(--orange)" : "rgba(79,195,247,0.3)";
  return `
    <div class="card" data-card-key="${esc(cardKey)}" style="border-left:3px solid ${borderColor}${naMk ? ';filter:grayscale(1) opacity(0.5)' : ''}">
      <div class="card-top">
        <div>
          <span style="color:${isDel ? 'var(--amber)' : 'var(--accent)'};font-weight:600">${esc(e.direccion)}</span>
          <span style="opacity:0.3;margin-left:10px;font-size:11px">${years}a</span>
          ${isDel ? `<span class="delegado-badge" style="margin-left:8px">&#8618; ${esc(e.remitente)}</span>` : ''}
        </div>
        <div style="text-align:right;white-space:nowrap">
          <span style="opacity:0.5">${fmtMoney(e.importe)}</span>
          <span style="margin:0 6px;opacity:0.2">&rarr;</span>
          <span style="color:var(--green);font-weight:600">${fmtMoney(nuevo)}</span>
          <span style="font-size:11px;opacity:0.5;margin-left:6px">(+${fmtMoney(diff)})</span>
        </div>
      </div>
      <div class="card-grid">
        <div><span class="lbl">Inq: </span>${esc(e.inquilino||"-")}</div>
        <div><span class="lbl">Prop: </span>${esc(e.propietario||"-")}</div>
        <div><span class="lbl">Tel: </span>${telLink(e.telInq)}</div>
        <div><span class="lbl">Tel: </span>${telLink(e.telProp)}</div>
        ${e.mailInq?`<div class="full"><span class="lbl">Mail: </span><span class="mail-val">${esc(e.mailInq)}</span></div>`:""}
      </div>
      <div class="card-meta">Inicio: ${fmtDate(e.fechaInicio)}${e.ultimoAumento ? ` &middot; Ultimo aumento: ${fmtDate(e.ultimoAumento)}` : ""} &middot; Contrato: ${esc(e.contratoStr||"-")}</div>
      ${e.notas?`<div class="card-nota">${esc(e.notas)}</div>`:""}
      ${footerAumento(e, m, y, ipcVal)}
    </div>`;
}

function cardVenc(e, color, overdue) {
  color = color || "var(--red)";
  const mk          = marks[vncKey(e)];
  const mkR         = marks[vncKeyR(e)];
  const isRenCycle  = !!(mk && mk.nuevaInicio && mk.renewYears);
  const vd          = getVencDate(e) || new Date(0);
  const activeMk    = isRenCycle ? mkR : mk;
  const nrMkC       = marks[nrKey(e)];
  const bcolor      = activeMk ? "var(--green)" : nrMkC ? "rgba(150,150,150,0.3)" : color;
  const inicioLabel = `Inicio original: ${fmtDate(e.fechaInicio)}`;
  const overdueTag  = overdue
    ? `<span style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--red);background:rgba(239,83,80,0.12);border:1px solid rgba(239,83,80,0.3);border-radius:3px;padding:1px 6px;margin-left:6px;vertical-align:middle">VENCIDO ${monthsAgo(vd)}</span>`
    : '';
  return `
    <div class="card" style="border-left:3px solid ${bcolor}${nrMkC ? ';filter:grayscale(1) opacity(0.5)' : ''}">
      <div class="card-top">
        <span style="color:${bcolor};font-weight:600">${esc(e.direccion)}${overdueTag}</span>
        <span class="badge" style="background:${color}22;color:${color}">Vence ${fmtDate(vd)}</span>
      </div>
      <div class="card-grid">
        <div><span class="lbl">Inq: </span>${esc(e.inquilino||"-")}</div>
        <div><span class="lbl">Prop: </span>${esc(e.propietario||"-")}</div>
        <div><span class="lbl">Tel: </span>${telLink(e.telInq)}</div>
        <div><span class="lbl">Tel: </span>${telLink(e.telProp)}</div>
      </div>
      <div class="card-meta">${inicioLabel} &middot; Contrato: ${esc(e.contratoStr||"-")} &middot; Alquiler: ${fmtMoney(e.importe)}</div>
      ${e.notas?`<div class="card-nota">${esc(e.notas)}</div>`:""}
      <div style="padding:4px 0 2px">
        <button class="mark-btn" data-copy-venc-msg="${esc(vencRenewalMsg(e))}" style="font-size:11px;opacity:0.55;border-color:rgba(255,255,255,0.1)">&#128203; Copiar aviso de renovaci&oacute;n</button>
      </div>
      ${footerVenc(e)}
    </div>`;
}

// ─── OPTIMIZACION A: actualizacion quirurgica de footer ──────────────────────
function patchCardFooter(key) {
  const cardEl = document.querySelector('[data-card-key="' + CSS.escape(key) + '"]');
  if (!cardEl) { render(); return; }
  const parts = key.split('|');
  const dir = parts[1], m = +parts[2], y = +parts[3];
  const entry = entries && entries.find(e => e.direccion === dir);
  if (!entry) { render(); return; }
  const mk    = marks[key];
  const naKy  = `na|${dir}|${m}|${y}`;
  const naMk  = marks[naKy];
  const isDel = Boolean(entry.remitente);
  cardEl.style.borderLeftColor = mk ? "var(--green)" : naMk ? "rgba(150,150,150,0.3)" : isDel ? "var(--amber)" : entry.notas ? "var(--orange)" : "rgba(79,195,247,0.3)";
  cardEl.style.filter = naMk ? 'grayscale(1) opacity(0.5)' : '';
  const oldFooter = cardEl.querySelector('.card-footer');
  if (oldFooter) {
    const tmp = document.createElement('div');
    tmp.innerHTML = footerAumento(entry, m, y, ipc);
    const newFooter = tmp.firstElementChild;
    if (newFooter) oldFooter.replaceWith(newFooter);
  }
}

// ─── OPTIMIZACION D: limpieza de marks huerfanas ─────────────────────────────
function cleanOrphanedMarks() {
  if (!entries) return;
  const dirs = new Set(entries.map(e => e.direccion));
  let changed = false;
  Object.keys(marks).forEach(k => {
    const dir = k.split('|')[1];
    if (dir && !dirs.has(dir)) { delete marks[k]; changed = true; }
  });
  if (changed) saveMarks();
}

// ─── RENDER (operativo + despacho de tabs) ───────────────────────────────────
function render() {
  if (!entries) return;
  document.getElementById("file-info").textContent = `${fileName} -- ${entries.length} activos`;

  // Visibilidad de paneles segun tab
  const isDB    = activeTab === 'basedatos';
  const isAdmin = activeTab === 'administraciones';
  document.getElementById("content").style.display     = (isDB || isAdmin) ? 'none'  : 'block';
  document.getElementById("db-panel").style.display    = isDB    ? 'block' : 'none';
  document.getElementById("admin-panel").style.display = isAdmin ? 'block' : 'none';
  document.getElementById("op-controls").style.display = (isDB || isAdmin) ? 'none'  : 'flex';

  // Contadores de tabs
  const nxM = selMonth===12 ? 1 : selMonth+1;
  const nxY = selMonth===12 ? selYear+1 : selYear;
  const aumentos        = getAumentos(entries, selMonth, selYear);
  const vencimientos    = getVencimientos(entries, selMonth, selYear);
  const aumentosProx    = getAumentos(entries, nxM, nxY);
  const vencProx        = getVencimientos(entries, nxM, nxY);
  const vencAtrasados   = getVencidosAtrasados(entries, selMonth, selYear);

  document.getElementById("tab-aumentos").textContent        = `Aumentos (${aumentos.length})`;
  document.getElementById("tab-vencimientos").textContent    = `Vencimientos (${vencimientos.length+vencProx.length+vencAtrasados.length})`;
  document.getElementById("tab-basedatos").textContent       = `Base de Datos (${entries.length})`;
  document.getElementById("tab-administraciones").textContent = `Administraciones (${admins ? admins.length : 0})`;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab===activeTab));

  if (isDB) {
    renderDBTable();
    return;
  }
  if (isAdmin) {
    renderAdminTable();
    return;
  }

  const content  = document.getElementById("content");
  const showAll  = !opShowSinResolver && !opShowResuelto;
  const showPend = opShowSinResolver || showAll;
  const showResv = opShowResuelto    || showAll;

  if (activeTab === "aumentos") {
    const aumPend  = aumentos.filter(e => !isAumentoResuelto(e, selMonth, selYear));
    const aumResv  = aumentos.filter(e =>  isAumentoResuelto(e, selMonth, selYear));
    const proxPend = aumentosProx.filter(e => !isAumentoResuelto(e, nxM, nxY));
    const proxResv = aumentosProx.filter(e =>  isAumentoResuelto(e, nxM, nxY));

    let h = `<div class="sec-title">${MONTH_NAMES[selMonth]} ${selYear} -- aumento ${ipc}%</div>`;
    const visibleAum  = (showPend ? aumPend  : []).concat(showResv ? aumResv  : []);
    const visibleProx = (showPend ? proxPend : []).concat(showResv ? proxResv : []);
    if (visibleAum.length === 0) {
      h += `<div class="empty">Sin aumentos ${opShowSinResolver ? 'pendientes' : opShowResuelto ? 'resueltos' : ''} este mes</div>`;
    } else {
      if (showPend && aumPend.length)  h += `<div class="card-list">${aumPend.map(e=>cardAumento(e,selMonth,selYear,ipc)).join("")}</div>`;
      if (showResv && aumResv.length)  h += `<div class="card-list">${aumResv.map(e=>cardAumentoCompact(e,selMonth,selYear)).join("")}</div>`;
    }
    if (visibleProx.length > 0) {
      h += `<div class="sec-title sep">Proximo: ${MONTH_NAMES[nxM]} ${nxY} (${visibleProx.length})</div>`;
      if (showPend && proxPend.length) h += `<div class="card-list dim">${proxPend.map(e=>cardAumento(e,nxM,nxY,ipc)).join("")}</div>`;
      if (showResv && proxResv.length) h += `<div class="card-list dim">${proxResv.map(e=>cardAumentoCompact(e,nxM,nxY)).join("")}</div>`;
    }
    content.innerHTML = h;
  } else {
    const vencPend = vencimientos.filter(e => !isVencResuelto(e));
    const vencResv = vencimientos.filter(e =>  isVencResuelto(e));
    const proxPend = vencProx.filter(e => !isVencResuelto(e));
    const proxResv = vencProx.filter(e =>  isVencResuelto(e));

    let h = '';
    if (showPend && vencAtrasados.length > 0) {
      h += `<div class="sec-title" style="color:var(--red);opacity:0.8">&#9888; Vencidos sin resolver (${vencAtrasados.length})</div>`;
      h += `<div class="card-list">${vencAtrasados.map(e=>cardVenc(e,"var(--red)",true)).join("")}</div>`;
    }
    h += `<div class="sec-title${(showPend && vencAtrasados.length) ? ' sep' : ''}">${MONTH_NAMES[selMonth]} ${selYear} -- 1a firmado = 2 reales, 2a = 3</div>`;
    const visibleVenc = (showPend ? vencPend : []).concat(showResv ? vencResv : []);
    if (visibleVenc.length === 0) {
      h += `<div class="empty">Sin vencimientos ${opShowSinResolver ? 'pendientes' : opShowResuelto ? 'resueltos' : ''} este mes</div>`;
    } else {
      if (showPend && vencPend.length) h += `<div class="card-list">${vencPend.map(e=>cardVenc(e)).join("")}</div>`;
      if (showResv && vencResv.length) h += `<div class="card-list">${vencResv.map(e=>cardVencCompact(e)).join("")}</div>`;
    }
    const visibleProx = (showPend ? proxPend : []).concat(showResv ? proxResv : []);
    h += `<div class="sec-title sep">Proximo: ${MONTH_NAMES[nxM]} ${nxY} (${visibleProx.length})</div>`;
    if (visibleProx.length === 0) {
      h += `<div class="empty">Sin vencimientos ${opShowSinResolver ? 'pendientes' : opShowResuelto ? 'resueltos' : ''} el mes que viene</div>`;
    } else {
      if (showPend && proxPend.length) h += `<div class="card-list">${proxPend.map(e=>cardVenc(e,"var(--amber)")).join("")}</div>`;
      if (showResv && proxResv.length) h += `<div class="card-list">${proxResv.map(e=>cardVencCompact(e)).join("")}</div>`;
    }
    content.innerHTML = h;
  }
}

// ─── PANTALLAS ────────────────────────────────────────────────────────────────
function showApp() {
  document.getElementById("autoload-screen").style.display = "none";
  document.getElementById("upload-screen").style.display   = "none";
  document.getElementById("app-screen").style.display      = "block";
  populateDBYears();
  updateWriteBtn();
  render();
}
function showAutoLoad() {
  document.getElementById("autoload-screen").style.display = "flex";
  document.getElementById("upload-screen").style.display   = "none";
  document.getElementById("app-screen").style.display      = "none";
}
function showFallback() {
  document.getElementById("autoload-screen").style.display = "none";
  document.getElementById("upload-screen").style.display   = "flex";
  document.getElementById("app-screen").style.display      = "none";
}

// ─── FILE PROCESSING ─────────────────────────────────────────────────────────
function processArrayBuffer(buffer, name) {
  try {
    // Parsear con bookVBA:true para preservar macros en write-back
    workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', bookVBA: true });
    const ws = workbook.Sheets["ALQUILADOS"] || workbook.Sheets[workbook.SheetNames[0]];
    entries  = parseSheet(ws);
    const wsAdmin = workbook.Sheets["ADMINISTRACIONES"];
    admins   = wsAdmin ? parseAdminSheet(wsAdmin) : [];
    fileName = name;
    cleanOrphanedMarks();
    showApp();
    fetchIPC();
  } catch(err) {
    console.error(err);
    alert("Error al leer el archivo.\nVerifica que sea un .xlsx / .xlsm valido.\n\n" + err.message);
    showFallback();
  }
}

function processFile(file) {
  document.getElementById("drop-label").textContent = "Procesando...";
  const reader = new FileReader();
  reader.onload  = ev => processArrayBuffer(ev.target.result, file.name);
  reader.onerror = ()  => { alert("No se pudo leer el archivo."); showFallback(); };
  reader.readAsArrayBuffer(file);
}

// ─── AUTO-LOAD ────────────────────────────────────────────────────────────────
function fetchWithTimeout(url, ms) {
  const ctrl=new AbortController(), tid=setTimeout(()=>ctrl.abort(),ms);
  return fetch(url,{signal:ctrl.signal}).finally(()=>clearTimeout(tid));
}

async function attemptAutoLoad() {
  showAutoLoad();
  serverAvailable = false;
  const status = document.getElementById('autoload-status');

  if (window._AUTODATA) {
    status.textContent = 'Cargando datos...';
    try {
      const bin = atob(window._AUTODATA);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      serverAvailable = true;
      processArrayBuffer(buf.buffer, 'planilla.xlsm');
      return;
    } catch(e) { console.error('_AUTODATA error:', e); }
  }

  status.textContent = 'Conectando...';
  try {
    const r = await fetchWithTimeout(_SERVER_EXCEL, 5000);
    if (r.ok) {
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 0) {
        serverAvailable = true;
        processArrayBuffer(buf, 'planilla.xlsm');
        return;
      }
    }
  } catch(_) {}

  status.textContent = 'No se pudo acceder al archivo. Usa el selector manual.';
  await new Promise(r => setTimeout(r, 400));
  showFallback();
}

// Selector manual de archivos (fallback)
async function openFilePicker() {
  const btn = document.getElementById('btn-autoload');
  btn.disabled = true;
  try {
    // Carga manual siempre -- serverAvailable queda en false (sin write-back)
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xls,.xlsm';
    inp.onchange = ev => { if (ev.target.files[0]) { serverAvailable = false; processFile(ev.target.files[0]); } };
    inp.click();
    btn.disabled = false;
  } catch(err) {
    btn.disabled = false;
    if (err.name !== 'AbortError') console.error(err);
  }
}

// ─── IPC AUTO-FETCH ───────────────────────────────────────────────────────────
const MES_ES = ["","enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","setiembre","octubre","noviembre","diciembre"];

function ipcPageURL(month, year) {
  return `https://www.gub.uy/instituto-nacional-estadistica/comunicacion/publicaciones/indice-precios-del-consumo-ipc-${MES_ES[month]}-${year}`;
}
function latestPublishedIPC() {
  const now=new Date(), d=now.getDate(), m=now.getMonth()+1, y=now.getFullYear();
  if (d>=5) return m===1 ? {month:12,year:y-1} : {month:m-1,year:y};
  if (m===1) return {month:11,year:y-1};
  if (m===2) return {month:12,year:y-1};
  return {month:m-2,year:y};
}
const PROXIES=[
  u=>u,
  u=>`https://corsproxy.io/?${encodeURIComponent(u)}`,
  u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u=>`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u=>`https://thingproxy.freeboard.io/fetch/${u}`,
];
async function fetchIPC() {
  const btn=document.getElementById("btn-ipc-fetch"), period=document.getElementById("ipc-period");
  btn.textContent="..."; btn.disabled=true; period.textContent="";
  const {month,year}=latestPublishedIPC();

  // Intenta primero el servidor local (sin CORS)
  if (serverAvailable) {
    try {
      const r=await fetchWithTimeout(
        `http://localhost:7890/ipc-fetch?mes=${MES_ES[month]}&anio=${year}`, 10000);
      if (r.ok || r.status === 404) {
        const j=await r.json();
        if (j.ipc) {
          ipc=parseFloat(j.ipc.replace(",","."));
          document.getElementById("inp-ipc").value=ipc;
          period.textContent=`${MES_ES[month].charAt(0).toUpperCase()+MES_ES[month].slice(1)} ${year}`;
          btn.textContent="↻"; btn.disabled=false;
          render(); return;
        }
        if (j.debug) { console.warn("IPC debug:", j.debug); }
      }
    } catch(_){}
  }

  // Fallback: proxies externos
  const url=ipcPageURL(month,year);
  let html=null;
  for (const p of PROXIES) {
    try { const r=await fetchWithTimeout(p(url),7000); if(r.ok){html=await r.text();break;} } catch(_){}
  }
  btn.textContent="↻"; btn.disabled=false;
  if (!html) { period.textContent="sin conexion"; return; }
  const m1=html.match(/[uú]ltimos\s+12\s+meses\s+de\s+([\d,]+)%/i);
  const m2=html.match(/Var\.12\s+meses\)\s+\d{2}\/\d{2}:\s*([\d,]+)%/i);
  const m3=html.match(/variaci[oó]n[^<]{0,60}12[^<]{0,60}([\d,]+)%/i);
  const raw=(m1||m2||m3)?.[1];
  if (!raw) { period.textContent="no encontrado"; return; }
  ipc=parseFloat(raw.replace(",","."));
  document.getElementById("inp-ipc").value=ipc;
  period.textContent=`${MES_ES[month].charAt(0).toUpperCase()+MES_ES[month].slice(1)} ${year}`;
  render();
}

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Meses del selector operativo
  const selMonthEl = document.getElementById("sel-month");
  MONTH_NAMES.slice(1).forEach((name,i) => {
    const o=document.createElement("option"); o.value=i+1; o.textContent=name;
    if(i+1===selMonth) o.selected=true; selMonthEl.appendChild(o);
  });
  selMonthEl.addEventListener("change", e => { selMonth=+e.target.value; render(); });

  const selYearEl = document.getElementById("sel-year");
  [2024,2025,2026,2027,2028,2029,2030].forEach(y => {
    const o=document.createElement("option"); o.value=y; o.textContent=y;
    if(y===selYear) o.selected=true; selYearEl.appendChild(o);
  });
  selYearEl.addEventListener("change", e => { selYear=+e.target.value; render(); });

  document.getElementById("inp-ipc").addEventListener("input", e => { ipc=parseFloat(e.target.value)||0; render(); });
  document.getElementById("btn-ipc-fetch").addEventListener("click", fetchIPC);
  document.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => { activeTab=b.dataset.tab; render(); }));

  // Filtros resuelto / sin resolver (tabs operativas)
  document.getElementById("op-show-sinresolver").addEventListener("change", e => {
    opShowSinResolver = e.target.checked;
    if (opShowSinResolver) { opShowResuelto = false; document.getElementById("op-show-resuelto").checked = false; }
    render();
  });
  document.getElementById("op-show-resuelto").addEventListener("change", e => {
    opShowResuelto = e.target.checked;
    if (opShowResuelto) { opShowSinResolver = false; document.getElementById("op-show-sinresolver").checked = false; }
    render();
  });

  // Botones de pantalla inicial
  document.getElementById("btn-autoload").addEventListener("click", openFilePicker);
  document.getElementById("btn-cerrar").addEventListener("click", async () => {
    if (!confirm('Cerrar el servidor?\nEl Excel quedara libre para abrirlo normalmente.')) return;
    try { await fetch('http://localhost:7890/shutdown', { method: 'GET' }); } catch {}
    window.close();
  });

  document.getElementById("btn-cambiar").addEventListener("click", () => {
    entries=null; fileName=""; pendingVenc=null; serverAvailable=false; workbook=null;
    document.getElementById("autoload-status").textContent = "";
    attemptAutoLoad();
  });
  document.getElementById("btn-write").addEventListener("click", () => { /* solo informativo */ });

  // Drag & drop
  const dz = document.getElementById("dropzone");
  dz.addEventListener("dragover",  e=>{e.preventDefault();dz.classList.add("drag-over");});
  dz.addEventListener("dragleave", ()=>dz.classList.remove("drag-over"));
  dz.addEventListener("drop", e=>{
    e.preventDefault(); dz.classList.remove("drag-over");
    if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  });
  dz.addEventListener("click", ()=>{
    const i=document.createElement("input"); i.type="file"; i.accept=".xlsx,.xls,.xlsm";
    i.onchange=e=>{if(e.target.files[0])processFile(e.target.files[0]);}; i.click();
  });

  // Filtros Base de Datos
  document.getElementById("db-search").addEventListener("input", e => {
    dbSearchText = e.target.value;
    e.target.closest('.search-wrap').classList.toggle('has-text', !!e.target.value);
    renderDBTable();
  });
  document.getElementById("db-year").addEventListener("change", e => {
    dbFilterYear = +e.target.value;
    renderDBTable();
  });
  document.getElementById("db-month").addEventListener("change", e => {
    dbFilterMonth = +e.target.value;
    renderDBTable();
  });
  document.getElementById("db-show-active").addEventListener("change", e => {
    dbShowActive = e.target.checked;
    if (dbShowActive) { dbShowInactive = false; document.getElementById("db-show-inactive").checked = false; }
    renderDBTable();
  });
  document.getElementById("db-show-inactive").addEventListener("change", e => {
    dbShowInactive = e.target.checked;
    if (dbShowInactive) { dbShowActive = false; document.getElementById("db-show-active").checked = false; }
    renderDBTable();
  });

  // Buscador Administraciones
  document.getElementById("admin-search").addEventListener("input", e => {
    adminSearchText = e.target.value;
    e.target.closest('.search-wrap').classList.toggle('has-text', !!e.target.value);
    renderAdminTable();
  });

  // Botones clear en buscadores
  document.getElementById("db-search-clear").addEventListener("click", () => {
    const inp = document.getElementById("db-search");
    inp.value = ""; dbSearchText = "";
    inp.closest('.search-wrap').classList.remove('has-text');
    inp.focus(); renderDBTable();
  });
  document.getElementById("admin-search-clear").addEventListener("click", () => {
    const inp = document.getElementById("admin-search");
    inp.value = ""; adminSearchText = "";
    inp.closest('.search-wrap').classList.remove('has-text');
    inp.focus(); renderAdminTable();
  });

  // Acordeon Base de Datos (event delegation sobre tbody -- persiste entre renders)
  document.getElementById("db-tbody").addEventListener("click", async e => {
    // ── Editar alquiler ──
    const editBtn = e.target.closest("[data-edit-row]");
    if (editBtn) {
      e.stopPropagation();
      const rowIdx = +editBtn.dataset.editRow;
      const entry  = entries && entries.find(en => en._row === rowIdx);
      if (entry) showEditModal(entry);
      return;
    }

    // ── Eliminar alquiler ──
    const delBtn = e.target.closest("[data-delete-row]");
    if (delBtn) {
      e.stopPropagation();
      await deleteEntry(+delBtn.dataset.deleteRow, delBtn.dataset.deleteDir);
      return;
    }

    // ── Desmarcar renovacion desde el panel DB ──
    const dbVunc = e.target.closest("[data-db-vunc]");
    if (dbVunc) {
      e.stopPropagation();
      const dir = dbVunc.dataset.dbVunc;
      delete marks[`v|${dir}`];
      delete marks[`vr|${dir}`];
      saveMarks();
      renderDBTable();
      return;
    }
    const dbVuncR = e.target.closest("[data-db-vunc-r]");
    if (dbVuncR) {
      e.stopPropagation();
      delete marks[`vr|${dbVuncR.dataset.dbVuncR}`];
      saveMarks();
      renderDBTable();
      return;
    }

    // ── Guardar comentario ──
    const notaBtn = e.target.closest("[data-nota-row]");
    if (notaBtn) {
      e.stopPropagation();
      const rowIdx  = +notaBtn.dataset.notaRow;
      const entry   = entries && entries.find(ex => ex._row === rowIdx);
      if (!entry) return;
      const textarea = notaBtn.closest(".db-detail-inner").querySelector(".nota-textarea");
      const newText  = textarea ? textarea.value : "";
      // Actualizar memoria siempre
      entry.notas = newText.trim();
      if (serverAvailable) {
        await saveCommentToExcel(entry, newText);
      } else {
        showToast('Comentario guardado en memoria (launcher no disponible).', 'info');
      }
      notaBtn.textContent = '✓ Guardado';
      setTimeout(() => { notaBtn.textContent = 'Guardar comentario'; }, 2000);
      return;
    }

    // ── Toggle acordeon (solo si el click NO fue sobre el textarea o boton) ──
    if (e.target.closest(".nota-textarea") || e.target.closest(".nota-save-btn")) return;
    const row = e.target.closest(".db-row");
    if (!row) return;
    const dir = row.dataset.dir;
    const detRow = document.querySelector(`.db-detail-row[data-detail-dir="${CSS.escape(dir)}"]`);
    if (expandedRows.has(dir)) {
      expandedRows.delete(dir);
      row.classList.remove("expanded");
      if (detRow) detRow.style.display = "none";
    } else {
      expandedRows.add(dir);
      row.classList.add("expanded");
      if (detRow) detRow.style.display = "";
    }
  });

  // Modal agregar alquiler
  document.getElementById('btn-add-entry').addEventListener('click', showAddModal);
  document.getElementById('modal-close').addEventListener('click', hideAddModal);
  document.getElementById('modal-cancel').addEventListener('click', hideAddModal);
  document.getElementById('modal-submit').addEventListener('click', submitAddEntry);
  document.getElementById('modal-add').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-add')) hideAddModal();
  });

  // Modal agregar/editar administracion
  document.getElementById('btn-add-admin').addEventListener('click', () => showAdminModal(null));
  document.getElementById('modal-admin-close').addEventListener('click', hideAdminModal);
  document.getElementById('modal-admin-cancel').addEventListener('click', hideAdminModal);
  document.getElementById('modal-admin-submit').addEventListener('click', submitAdminEntry);
  document.getElementById('modal-admin').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-admin')) hideAdminModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideAddModal(); hideAdminModal(); }
  });

  // Acciones de fila en tabla Administraciones (editar / eliminar)
  document.getElementById('admin-tbody').addEventListener('click', e => {
    const editBtn = e.target.closest('[data-admin-edit]');
    if (editBtn) {
      const rowIdx = +editBtn.dataset.adminEdit;
      const entry  = admins && admins.find(a => a._row === rowIdx);
      if (entry) showAdminModal(entry);
      return;
    }
    const delBtn = e.target.closest('[data-admin-del]');
    if (delBtn) {
      const rowIdx = +delBtn.dataset.adminDel;
      const entry  = admins && admins.find(a => a._row === rowIdx);
      deleteAdminEntry(rowIdx, entry ? entry.nombre : '');
      return;
    }
  });

  // Autocomplete en modal de nuevo alquiler
  bindAutocomplete();

  // Arranque
  attemptAutoLoad();
});

// ─── AUTOCOMPLETE ────────────────────────────────────────────────────────────

const AC_FIELD_MAP = {
  'm-dir':       e => e.direccion,
  'm-prop':      e => e.propietario,
  'm-inq':       e => e.inquilino,
  'm-tel-prop':  e => e.telProp,
  'm-tel-inq':   e => e.telInq,
  'm-mail-prop': e => e.mailProp,
  'm-mail-inq':  e => e.mailInq,
};

let _acIdx       = -1;
let _acItems     = [];
let _acInput     = null;
let _acHideTimer = null;

function _acEl() { return document.getElementById('ac-dropdown'); }

function acShow(inputEl, suggestions) {
  const el = _acEl();
  if (!suggestions.length) { acHide(); return; }
  _acInput = inputEl;
  _acItems = suggestions;
  _acIdx   = -1;

  const q = norm(inputEl.value.trim());
  el.innerHTML = suggestions.map((s, i) => {
    const safe  = s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const start = norm(safe).indexOf(q);
    const hi = (start >= 0 && q.length)
      ? safe.slice(0, start) + '<mark>' + safe.slice(start, start + q.length) + '</mark>' + safe.slice(start + q.length)
      : safe;
    return `<div class="ac-item" data-ac-i="${i}">${hi}</div>`;
  }).join('');

  const rect = inputEl.getBoundingClientRect();
  el.style.left    = rect.left + 'px';
  el.style.top     = (rect.bottom + 2) + 'px';
  el.style.width   = Math.max(rect.width, 200) + 'px';
  el.style.display = 'block';
}

function acHide() {
  const el = _acEl();
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  _acIdx = -1; _acItems = []; _acInput = null;
}

function acSetActive(idx) {
  const items = _acEl().querySelectorAll('.ac-item');
  items.forEach((el, i) => el.classList.toggle('ac-active', i === idx));
  if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
  _acIdx = idx;
}

function acSelect(value) {
  const inputId = _acInput ? _acInput.id : null;
  if (_acInput) { _acInput.value = value; _acInput.dispatchEvent(new Event('change')); }
  if (inputId === 'm-dir') acFillFromDir(value);
  if (inputId === 'm-inq')  acFillFromInq(value);
  if (inputId === 'm-prop') acFillFromProp(value);
  acHide();
}

function acFillFromDir(dir) {
  if (!entries) return;
  // si hay varios (misma dirección alquilada varias veces), tomar el de mayor _row (más reciente)
  const matches = entries.filter(e => e.direccion === dir);
  if (!matches.length) return;
  const e = matches.reduce((a, b) => (b._row > a._row ? b : a));
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('m-prop',      e.propietario);
  set('m-tel-prop',  e.telProp);
  set('m-mail-prop', e.mailProp);
  set('m-importe',   e.importe || '');
  // fecha/duracion/notas no se tocan: son datos del nuevo contrato
  acFlash(['m-prop','m-tel-prop','m-mail-prop','m-importe']);
}

function acFillFromProp(prop) {
  if (!entries) return;
  const matches = entries.filter(e => e.propietario === prop);
  if (!matches.length) return;
  const e = matches.reduce((a, b) => (b._row > a._row ? b : a));
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('m-tel-prop',  e.telProp);
  set('m-mail-prop', e.mailProp);
  acFlash(['m-tel-prop','m-mail-prop']);
}

function acFillFromInq(inq) {
  if (!entries) return;
  const matches = entries.filter(e => e.inquilino === inq);
  if (!matches.length) return;
  const e = matches.reduce((a, b) => (b._row > a._row ? b : a));
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('m-tel-inq',  e.telInq);
  set('m-mail-inq', e.mailInq);
  acFlash(['m-tel-inq','m-mail-inq']);
}

function acFlash(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value) {
      el.style.transition = 'background 0s';
      el.style.background = 'rgba(79,195,247,0.18)';
      setTimeout(() => { el.style.transition = 'background 0.6s'; el.style.background = ''; }, 80);
    }
  });
}

function bindAutocomplete() {
  const dropEl = document.createElement('div');
  dropEl.id = 'ac-dropdown';
  document.body.appendChild(dropEl);

  dropEl.addEventListener('mousedown', e => {
    const item = e.target.closest('.ac-item');
    if (!item) return;
    e.preventDefault();
    acSelect(_acItems[+item.dataset.acI]);
  });

  Object.entries(AC_FIELD_MAP).forEach(([id, getter]) => {
    const inp = document.getElementById(id);
    if (!inp) return;

    inp.addEventListener('input', () => {
      if (!entries) { acHide(); return; }
      const q = norm(inp.value.trim());
      if (!q) { acHide(); return; }
      const unique = [...new Set(entries.map(getter).filter(v => v && v.trim()))];
      const matches = unique.filter(v => norm(v).includes(q)).slice(0, 12);
      acShow(inp, matches);
    });

    inp.addEventListener('keydown', e => {
      if (!_acItems.length || _acEl().style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acSetActive(Math.min(_acIdx + 1, _acItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acSetActive(Math.max(_acIdx - 1, 0));
      } else if (e.key === 'Enter' && _acIdx >= 0) {
        e.preventDefault();
        acSelect(_acItems[_acIdx]);
      } else if (e.key === 'Escape') {
        acHide();
      }
    });

    inp.addEventListener('blur', () => {
      _acHideTimer = setTimeout(acHide, 160);
    });

    inp.addEventListener('focus', () => {
      clearTimeout(_acHideTimer);
    });
  });
}

// ─── AGREGAR ALQUILER ────────────────────────────────────────────────────────

function showAddModal() {
  editingEntry = null;
  ['m-dir','m-prop','m-inq','m-tel-prop','m-tel-inq','m-mail-prop','m-mail-inq','m-importe','m-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('m-duracion').value = '';
  document.getElementById('m-fecha').value    = '';
  document.getElementById('modal-add-title').textContent = 'Nuevo Alquiler';
  const btn = document.getElementById('modal-submit');
  btn.disabled = false; btn.textContent = 'Guardar alquiler';
  document.getElementById('m-dir').removeAttribute('readonly');
  document.getElementById('modal-add').classList.add('open');
  setTimeout(() => document.getElementById('m-dir').focus(), 80);
}

function showEditModal(entry) {
  editingEntry = entry;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('m-dir',      entry.direccion);
  set('m-prop',     entry.propietario);
  set('m-tel-prop', entry.telProp);
  set('m-mail-prop',entry.mailProp);
  set('m-inq',      entry.inquilino);
  set('m-tel-inq',  entry.telInq);
  set('m-mail-inq', entry.mailInq);
  set('m-importe',  entry.importe || '');
  set('m-notas',    entry.notas);
  document.getElementById('m-duracion').value = entry.contratoStr || '';
  document.getElementById('m-fecha').value = entry.fechaInicio
    ? entry.fechaInicio.getFullYear() + '-' +
      String(entry.fechaInicio.getMonth()+1).padStart(2,'0') + '-' +
      String(entry.fechaInicio.getDate()).padStart(2,'0')
    : '';
  document.getElementById('modal-add-title').textContent = 'Editar Alquiler';
  const btn = document.getElementById('modal-submit');
  btn.disabled = false; btn.textContent = 'Guardar cambios';
  document.getElementById('m-dir').setAttribute('readonly', 'readonly');
  document.getElementById('modal-add').classList.add('open');
  setTimeout(() => document.getElementById('m-prop').focus(), 80);
}

function hideAddModal() {
  document.getElementById('modal-add').classList.remove('open');
  editingEntry = null;
}

// Recarga el Excel desde el servidor y actualiza entries sin mostrar pantalla de carga
async function reloadFromServer() {
  try {
    const r = await fetchWithTimeout(_SERVER_EXCEL, 6000);
    if (!r.ok) return false;
    const buf = await r.arrayBuffer();
    if (!buf.byteLength) return false;
    workbook = XLSX.read(new Uint8Array(buf), { type: 'array', bookVBA: true });
    const ws = workbook.Sheets["ALQUILADOS"] || workbook.Sheets[workbook.SheetNames[0]];
    entries  = parseSheet(ws);
    const wsAdmin = workbook.Sheets["ADMINISTRACIONES"];
    admins   = wsAdmin ? parseAdminSheet(wsAdmin) : [];
    cleanOrphanedMarks();
    populateDBYears();
    render();
    return true;
  } catch(_) { return false; }
}

async function deleteEntry(rowIdx, dir) {
  if (!serverAvailable) { showToast('Necesitas el launcher activo para eliminar.', 'err'); return; }
  if (!confirm(`Marcar "${dir}" como INACTIVO?\n\nSe marcara la fila en el Excel y dejara de aparecer en aumentos y vencimientos.`)) return;

  try {
    const resp = await fetch('http://localhost:7890/delete-row', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ row: rowIdx }),
    });
    if (resp.ok) {
      showToast('&#10003; Alquiler eliminado', 'ok');
      expandedRows.delete(dir);
      entries = entries.filter(e => e.direccion !== dir);
      render();
      reloadFromServer(); // sincronizar en background
    } else {
      const msg = await resp.text().catch(() => 'Error desconocido');
      showToast('Error: ' + msg, 'err');
    }
  } catch {
    showToast('No se pudo contactar el servidor.', 'err');
  }
}

async function submitAddEntry() {
  const dir     = (document.getElementById('m-dir').value || '').trim().toUpperCase();
  const importe = parseFloat(document.getElementById('m-importe').value);
  if (!dir)              { showToast('La direccion es obligatoria.', 'err'); return; }
  if (!importe || importe <= 0) { showToast('El importe es obligatorio.', 'err'); return; }
  if (!serverAvailable)  { showToast('Necesitas el launcher activo para agregar alquileres.', 'err'); return; }

  const payload = {
    direccion:   dir,
    propietario: (document.getElementById('m-prop').value     || '').trim(),
    telProp:     (document.getElementById('m-tel-prop').value || '').trim(),
    mailProp:    (document.getElementById('m-mail-prop').value|| '').trim(),
    inquilino:   (document.getElementById('m-inq').value      || '').trim(),
    telInq:      (document.getElementById('m-tel-inq').value  || '').trim(),
    mailInq:     (document.getElementById('m-mail-inq').value || '').trim(),
    importeBase: importe,
    contratoStr: document.getElementById('m-duracion').value  || '',
    fechaInicio: document.getElementById('m-fecha').value     || '',  // "YYYY-MM-DD" o ""
    notas:       (document.getElementById('m-notas').value    || '').trim(),
  };

  const isEdit  = editingEntry !== null;
  const endpoint = isEdit ? 'http://localhost:7890/edit-row' : 'http://localhost:7890/add-row';
  if (isEdit) payload.row = editingEntry._row;

  const btn = document.getElementById('modal-submit');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';

  try {
    const resp = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (resp.ok) {
      showToast(isEdit ? '&#10003; Alquiler actualizado' : '&#10003; Alquiler agregado correctamente', 'ok');
      hideAddModal();
      const ok = await reloadFromServer();
      if (!ok) showToast('No se pudo recargar la lista. Reinicia el launcher.', 'info');
    } else {
      const msg = await resp.text().catch(() => 'Error desconocido');
      showToast('Error: ' + msg, 'err');
      btn.disabled    = false;
      btn.textContent = isEdit ? 'Guardar cambios' : 'Guardar alquiler';
    }
  } catch(err) {
    showToast('No se pudo contactar el servidor.', 'err');
    btn.disabled    = false;
    btn.textContent = isEdit ? 'Guardar cambios' : 'Guardar alquiler';
  }
}

// ─── MARK INTERACTIONS (event delegation) ────────────────────────────────────
// Helper para leer los inputs de fecha/plazo del footer de vencimiento
function _readVencInputs(defaultYears) {
  const inp     = document.getElementById("inp-venc-date");
  const yearsEl = document.getElementById("inp-venc-years");
  const descEl  = document.getElementById("inp-venc-desc");
  const dateV   = inp ? inp.value : "";
  const d       = dateV ? parseISO(dateV) : null;
  const years   = yearsEl ? +yearsEl.value : defaultYears;
  const desc    = descEl ? descEl.value.trim() : '';
  return { d, years, desc };
}

document.getElementById("content").addEventListener("change", async e => {
  const chk = e.target.closest("[data-aum]");
  if (!chk) return;
  const key = chk.dataset.aum;
  if (chk.checked) {
    const today = new Date();
    marks[key] = { date: fmtDate(today), xlSaved: false };
    saveMarks();
    patchCardFooter(key);
    if (serverAvailable) {
      const parts = key.split('|');
      const dir   = parts[1], m = +parts[2], y = +parts[3];
      const entry = entries && entries.find(ex => ex.direccion === dir);
      if (entry) {
        const newAmount = Math.floor(entry.importe * (1 + ipc/100));
        const ok = await saveIncreaseToExcel(entry, newAmount, today);
        if (ok) {
          marks[key].xlSaved = true;
          saveMarks();
          patchCardFooter(key);
        }
      }
    }
  } else {
    delete marks[key];
    saveMarks();
    patchCardFooter(key);
  }
});

document.getElementById("content").addEventListener("click", async e => {
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) {
    copyToClipboard(copyBtn.dataset.copy);
    copyBtn.classList.add("copied");
    const orig = copyBtn.textContent;
    copyBtn.textContent = "✓";
    setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove("copied"); }, 1800);
    return;
  }

  // ── na-start (iniciar "no aumenta") ──────────────────────────────────────
  const naStart = e.target.closest("[data-na-start]");
  if (naStart) {
    pendingNoAum = naStart.dataset.naStart;
    pendingNoRen = null;
    render();
    setTimeout(() => { const el = document.getElementById('inp-na-desc'); if (el) el.focus(); }, 50);
    return;
  }
  if (e.target.closest("[data-na-cancel]")) { pendingNoAum = null; render(); return; }

  // ── na-conf (confirmar no aumenta) ────────────────────────────────────────
  const naConf = e.target.closest("[data-na-conf]");
  if (naConf) {
    const naKy   = naConf.dataset.naConf;
    const descEl = document.getElementById('inp-na-desc');
    const desc   = descEl ? descEl.value.trim() : '';
    const parts  = naKy.split('|');   // na|dir|m|y
    const dir = parts[1];
    const entry  = entries && entries.find(ex => ex.direccion === dir);
    marks[naKy]  = { date: fmtDate(new Date()), desc };
    saveMarks();
    pendingNoAum = null;
    if (serverAvailable && entry && desc) {
      const txt  = `NO AUMENTA: ${desc}`;
      const prev = entry.notas ? entry.notas.trim() : '';
      const val  = prev ? prev + ' | ' + txt : txt;
      await saveToServer([{ r: entry._row, c: 13, v: val }]);
      entry.notas = val;
    }
    render();
    return;
  }

  // ── un-na (deshacer no aumenta) ───────────────────────────────────────────
  const unNa = e.target.closest("[data-un-na]");
  if (unNa) { delete marks[unNa.dataset.unNa]; saveMarks(); render(); return; }

  // ── nr-start (iniciar "no renueva") ──────────────────────────────────────
  const nrStart = e.target.closest("[data-nr-start]");
  if (nrStart) {
    pendingNoRen = nrStart.dataset.nrStart;
    pendingVenc  = null;
    pendingNoAum = null;
    render();
    setTimeout(() => { const el = document.getElementById('inp-nr-desc'); if (el) el.focus(); }, 50);
    return;
  }
  if (e.target.closest("[data-nr-cancel]")) { pendingNoRen = null; render(); return; }

  // ── nr-conf (confirmar no renueva) ────────────────────────────────────────
  const nrConf = e.target.closest("[data-nr-conf]");
  if (nrConf) {
    const dir    = nrConf.dataset.nrConf;
    const descEl = document.getElementById('inp-nr-desc');
    const desc   = descEl ? descEl.value.trim() : '';
    const entry  = entries && entries.find(ex => ex.direccion === dir);
    marks[`nr|${dir}`] = { date: fmtDate(new Date()), desc };
    saveMarks();
    pendingNoRen = null;
    if (serverAvailable && entry && desc) {
      const txt  = `NO RENUEVA: ${desc}`;
      const prev = entry.notas ? entry.notas.trim() : '';
      const val  = prev ? prev + ' | ' + txt : txt;
      await saveToServer([{ r: entry._row, c: 13, v: val }]);
      entry.notas = val;
    }
    render();
    return;
  }

  // ── un-nr (deshacer no renueva) ───────────────────────────────────────────
  const unNr = e.target.closest("[data-un-nr]");
  if (unNr) { delete marks[`nr|${unNr.dataset.unNr}`]; saveMarks(); render(); return; }

  // ── copiar aviso de renovacion ───────────────────────────────────────────
  const copyVenc = e.target.closest("[data-copy-venc-msg]");
  if (copyVenc) {
    const msg = copyVenc.dataset.copyVencMsg;
    navigator.clipboard.writeText(msg).then(() => {
      const orig = copyVenc.innerHTML;
      copyVenc.innerHTML = "&#10003; Copiado";
      copyVenc.style.color = "var(--green)";
      setTimeout(() => { copyVenc.innerHTML = orig; copyVenc.style.color = ""; }, 1800);
    });
    return;
  }

  // ── un-ren / un-ren-r (deshacer renovacion desde card compacto) ──────────
  const unRen = e.target.closest("[data-un-ren]");
  if (unRen) { delete marks[`v|${unRen.dataset.unRen}`]; saveMarks(); render(); return; }
  const unRenR = e.target.closest("[data-un-ren-r]");
  if (unRenR) { delete marks[`vr|${unRenR.dataset.unRenR}`]; saveMarks(); render(); return; }

  // ── vstart / vstart-r ───────────────────────────────────────────────────────
  const vstart = e.target.closest("[data-vstart]");
  if (vstart) { pendingNoRen = null; pendingNoAum = null; pendingVenc = vstart.dataset.vstart; render(); return; }

  const vstartR = e.target.closest("[data-vstart-r]");
  if (vstartR) { pendingNoRen = null; pendingNoAum = null; pendingVenc = 'R:' + vstartR.dataset.vstartR; render(); return; }

  if (e.target.closest("[data-vcancel]")) { pendingVenc = null; render(); return; }

  // ── vconf (ciclo original) ─────────────────────────────────────────────────
  const vconf = e.target.closest("[data-vconf]");
  if (vconf) {
    const dir    = vconf.dataset.vconf;
    const entry  = entries && entries.find(ex => ex.direccion === dir);
    const defY   = entry ? (realDuration(entry.contratoDuracion) || 2) : 2;
    const { d, years, desc } = _readVencInputs(defY);
    const key    = `v|${dir}`;
    marks[key]   = { date: fmtDate(new Date()), nuevaInicio: d ? fmtDate(d) : "", renewYears: years, xlSaved: false };
    saveMarks();
    pendingVenc  = null;
    if (serverAvailable && entry) {
      const ok = await saveRenewalToExcel(entry, d, years, desc);
      if (ok) { marks[key].xlSaved = true; saveMarks(); }
    }
    render();
    return;
  }

  // ── vconf-r (ciclo post-renovacion) ───────────────────────────────────────
  const vconfR = e.target.closest("[data-vconf-r]");
  if (vconfR) {
    const dir    = vconfR.dataset.vconfR;
    const entry  = entries && entries.find(ex => ex.direccion === dir);
    const mkPrev = marks[vncKey({ direccion: dir })];
    const defY   = mkPrev ? (mkPrev.renewYears || 2) : 2;
    const { d, years, desc } = _readVencInputs(defY);
    const key    = `vr|${dir}`;
    marks[key]   = { date: fmtDate(new Date()), nuevaInicio: d ? fmtDate(d) : "", renewYears: years, xlSaved: false };
    saveMarks();
    pendingVenc  = null;
    if (serverAvailable && entry) {
      const ok = await saveRenewalToExcel(entry, d, years, desc);
      if (ok) { marks[key].xlSaved = true; saveMarks(); }
    }
    render();
    return;
  }

  // ── vunc (desmarcar ciclo original) ──────────────────────────────────────
  const vunc = e.target.closest("[data-vunc]");
  if (vunc) {
    delete marks[`v|${vunc.dataset.vunc}`];
    delete marks[`vr|${vunc.dataset.vunc}`]; // tambien limpia el ciclo R si lo habia
    saveMarks(); render(); return;
  }

  // ── vunc-r (desmarcar solo ciclo post-renovacion) ─────────────────────────
  const vuncR = e.target.closest("[data-vunc-r]");
  if (vuncR) { delete marks[`vr|${vuncR.dataset.vuncR}`]; saveMarks(); render(); return; }
});
