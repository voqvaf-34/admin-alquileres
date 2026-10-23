// Pestaña Base de Datos: filtros, tabla, detalle y comentarios.
import { esNuevo, puntoNuevo } from '../componentes/novedades.js';
import * as D from '../../../dominios/index.js';
import { formatearFecha, normalizar, interpretarDMA, claveVenc, claveVencRenovado } from '../../../dominios/index.js';
import { deleteEntry, showEditModal } from '../modales/alquiler.js';
import { showTimeline } from '../modales/linea-tiempo.js';
import { guardarMarcas, saveNotes } from '../nucleo/datos.js';
import { esc } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { MONTH_NAMES, fmtMails, fmtMoney, fmtNames, garantiaBadge, telLink } from '../nucleo/formato.js';
import { contactRow } from './propietarios.js';

function getDBFiltered() {
  if (!estado.entries) return [];
  // ninguno seleccionado = mostrar todos; uno seleccionado = filtrar
  let list = (!estado.dbShowActive && !estado.dbShowInactive)
    ? estado.entries
    : estado.entries.filter(e => e.inactive ? estado.dbShowInactive : estado.dbShowActive);
  if (estado.dbFilterYear > 0)
    list = list.filter(e => e.fechaInicio && e.fechaInicio.getFullYear() === estado.dbFilterYear);
  if (estado.dbFilterMonth > 0)
    list = list.filter(e => e.fechaInicio && e.fechaInicio.getMonth() + 1 === estado.dbFilterMonth);
  if (estado.dbSearchText.trim()) {
    const q = normalizar(estado.dbSearchText);
    list = list.filter(e =>
      normalizar(e.direccion).includes(q) ||
      normalizar(e.propietario).includes(q) ||
      normalizar(e.inquilino).includes(q) ||
      (e.telProp||'').includes(q) ||
      (e.telInq||'').includes(q) ||
      normalizar(e.mailProp).includes(q) ||
      normalizar(e.mailInq).includes(q) ||
      normalizar(e.garantia).includes(q) ||
      normalizar(e.remitente).includes(q)
    );
  }
  return list;
}

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

export function renderDBTable() {
  if (!estado.entries) return;
  const filtered = getDBFiltered();
  const porDireccion = D.indicePorDireccion(estado.entries);   // una vez por dibujo, no por fila
  // Ordenar cronologicamente por fecha de inicio (null al final)
  const sorted = filtered.slice().sort((a, b) => {
    const fa = a.fechaInicio ? a.fechaInicio.getTime() : Infinity;
    const fb = b.fechaInicio ? b.fechaInicio.getTime() : Infinity;
    return fa - fb;
  });

  const countEl = document.getElementById('db-count');
  if (countEl) countEl.textContent = `${sorted.length} / ${estado.entries.length} registros`;

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
  const hasYear  = estado.dbFilterYear  > 0;
  const hasMes   = estado.dbFilterMonth > 0;
  let groupBy = 'none';
  if      (!hasYear && !hasMes) groupBy = 'year';
  else if ( hasYear && !hasMes) groupBy = 'month';
  else if (!hasYear &&  hasMes) groupBy = 'year';
  // hasYear && hasMes -> 'none'

  // Visor: lo nuevo va arriba de todo (grupo "Nuevos") mientras se este en la pestaña
  const nuevos = sorted.filter(e => esNuevo('basedatos', e.id));
  const resto  = nuevos.length ? sorted.filter(e => !esNuevo('basedatos', e.id)) : sorted;

  // Pre-calcular tamanos de grupo para el contador
  const groupCount = new Map();
  if (groupBy !== 'none') {
    for (const e of resto) {
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

  // Fila principal (+ detalle si esta abierta; si no, se arma al abrirla)
  const fila = e => {
    const isExp = estado.expandedRows.has(e.id);
    return `<tr class="db-row${isExp ? ' expanded' : ''}${e.inactive ? ' db-row-inactive' : ''}" data-id="${e.id}">
      <td class="db-dir">${esc(e.direccion)}${e.inactive ? `<span class="inactive-badge">INACTIVO</span>` : ''}${garantiaBadge(e)}${e.remitente ? `<span class="delegado-badge" style="margin-left:8px;font-size:10px" title="Aumentos los hace ${esc(e.remitente)}">&#8618; ${esc(e.remitente)}</span>` : ''}</td>
      <td>${fmtNames(e.propietario)}</td>
      <td>${fmtNames(e.inquilino)}</td>
      <td style="white-space:nowrap;color:var(--dim)">${formatearFecha(e.fechaInicio)}</td>
      <td class="db-chevron">${puntoNuevo('basedatos', e.id)}&#9658;</td>
    </tr>` + (isExp ? filaDetalle(e, porDireccion) : '');
  };

  let html = nuevos.length
    ? dbSepRow('Nuevos', nuevos.length + (nuevos.length === 1 ? ' contrato' : ' contratos')) + nuevos.map(fila).join('')
    : '';
  let lastKey = Symbol(); // garantiza que el primer grupo siempre inserta separador
  for (const e of resto) {
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
    html += fila(e);
  }

  tbody.innerHTML = html;
}

// Recuadro verde "Renovado el ..." (o "2a renovacion") con su boton para desmarcar.
function insigniaRenovacion(e, dir) {
  const mkV  = estado.marks[claveVenc(e)];
  const mkVR = estado.marks[claveVencRenovado(e)];
  if (mkVR) {
    return `<div class="renov-badge">
      <span>&#10003; 2a renovacion el ${mkVR.date}${mkVR.nuevaInicio ? ` &middot; Nuevo inicio: ${mkVR.nuevaInicio} &middot; ${mkVR.renewYears}a` : ''}</span>
      <button class="unmark-btn" data-db-vunc-r="${dir}" title="Desmarcar 2a renovacion" style="margin-left:auto">&times;</button>
    </div>`;
  }
  if (!mkV) return '';
  // Si el vencimiento de la renovacion ya paso, avisar
  let vencNote = '';
  const ni = mkV.nuevaInicio && mkV.renewYears && interpretarDMA(mkV.nuevaInicio);
  if (ni) {
    const nvDate = new Date(ni.getFullYear() + mkV.renewYears, ni.getMonth(), Math.min(ni.getDate(), 28));
    if (nvDate <= new Date()) vencNote = `<span style="color:var(--amber)"> &middot; &#9888; Venc. renovacion: ${formatearFecha(nvDate)}</span>`;
  }
  return `<div class="renov-badge">
    <span>&#10003; Renovado el ${mkV.date}${mkV.nuevaInicio ? ` &middot; Inicio: ${mkV.nuevaInicio} &middot; ${mkV.renewYears}a` : ''}${vencNote}</span>
    <button class="unmark-btn" data-db-vunc="${dir}" title="Desmarcar renovacion" style="margin-left:auto">&times;</button>
  </div>`;
}

// Detalle de un alquiler (se muestra al abrir su fila).
function filaDetalle(e, porDireccion) {
  const dir = esc(e.direccion);
  return `<tr class="db-detail-row" data-detail-id="${e.id}">
      <td colspan="5">
        <div class="db-detail-inner">
          <div class="db-detail-grid">
            <div><span class="lbl">Alquiler: </span><strong>${fmtMoney(e.importe, e.moneda)}</strong></div>
            <div><span class="lbl">Ult. aumento: </span>${e.ultimoAumento ? formatearFecha(e.ultimoAumento) : '<span style="color:var(--dim)">-</span>'}</div>
            <div><span class="lbl">Contrato: </span>${esc(e.contratoStr||'-')}</div>
            <div><span class="lbl">Garantía: </span>${e.garantia ? esc(e.garantia) : '<span class="missing">sin cargar</span>'}</div>
            <div><span class="lbl">Aumentos: </span>${D.gestionadoPor(e) ? esc(D.gestionadoPor(e)) : 'La inmobiliaria'}</div>
            ${e.propietario ? `<div><span class="lbl">Propietario: </span>${fmtNames(e.propietario)}</div>` : ''}
            <div><span class="lbl">Tel. Prop: </span>${telLink(e.telProp)}</div>
            ${e.mailProp ? `<div><span class="lbl">Mail Prop: </span>${fmtMails(e.mailProp)}</div>` : ''}
            ${contactRow(e, 'dfull')}
            ${e.inquilino ? `<div><span class="lbl">Inquilino: </span>${fmtNames(e.inquilino)}</div>` : ''}
            <div><span class="lbl">Tel. Inq: </span>${telLink(e.telInq)}</div>
            ${e.mailInq ? `<div><span class="lbl">Mail Inq: </span>${fmtMails(e.mailInq)}</div>` : ''}
          </div>
          ${insigniaRenovacion(e, dir)}
          ${e.direccionOriginal && e.direccionOriginal !== e.direccion ? `<div style="margin-top:8px;font-size:11px;color:var(--dim)">Registrado originalmente como: ${esc(e.direccionOriginal)}</div>` : ''}
          <div class="nota-edit-section">
            <span class="nota-label">Comentarios</span>
            <div class="notas-list">${D.separarNotas(e.notas).map((n, i) => D.interpretarNotaRenovacion(n) ? '' : `
              <div class="nota-chip"><span class="nota-txt" data-nota-edit="${e.id}" data-i="${i}" title="Clic para corregir">${esc(n)}</span><button class="chip-x" data-nota-del="${e.id}" data-i="${i}" title="Borrar comentario">&times;</button></div>`).join('')}
            </div>
            <div class="nota-bar">
              <button class="chip chip-add" data-nota-add="${e.id}">&#65291; Comentario</button>
              ${D.renovaciones(e, estado.marks, porDireccion).lista.length ? `<button class="mark-btn" data-timeline="${e.id}" title="Cuándo entró, cuándo venció y cada renovación">&#128339; Línea de tiempo</button>` : ''}
            </div>
            <div class="nota-new" hidden>
              <textarea class="nota-textarea" rows="2" placeholder="Escribí el comentario (Enter guarda)"></textarea>
              <div class="nota-actions">
                <button class="mark-btn" data-nota-cancel>Cancelar</button>
                <button class="nota-save-btn" data-nota-row="${e.id}">Guardar comentario</button>
              </div>
            </div>
          </div>
          <div class="db-detail-acciones">
            <button class="mark-btn btn-editar-fila" data-edit-row="${e.id}">&#9998; Editar datos</button>
            ${!e.inactive ? `<button class="mark-btn btn-inactivar-fila" data-delete-row="${e.id}" data-delete-dir="${dir}">&#8855; Marcar como inactivo</button>` : ''}
          </div>
        </div>
      </td>
    </tr>`;
}

// Inicializa el dropdown de anos del panel DB con los anos en entries
export function populateDBYears() {
  const sel = document.getElementById('db-year');
  if (!sel || !estado.entries) return;
  const years = [...new Set(
    estado.entries.filter(e => e.fechaInicio).map(e => e.fechaInicio.getFullYear())
  )].sort();
  // Limpiar y repoblar (conservar "Todos")
  sel.innerHTML = '<option value="0">Todos</option>';
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === estado.dbFilterYear) o.selected = true;
    sel.appendChild(o);
  });
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Filtros Base de Datos
  document.getElementById('db-search').addEventListener('input', e => {
    estado.dbSearchText = e.target.value;
    e.target.closest('.search-wrap').classList.toggle('has-text', !!e.target.value);
    renderDBTable();
  });
  document.getElementById('db-year').addEventListener('change', e => {
    estado.dbFilterYear = +e.target.value;
    renderDBTable();
  });
  document.getElementById('db-month').addEventListener('change', e => {
    estado.dbFilterMonth = +e.target.value;
    renderDBTable();
  });
  document.getElementById('db-show-active').addEventListener('change', e => {
    estado.dbShowActive = e.target.checked;
    if (estado.dbShowActive) { estado.dbShowInactive = false; document.getElementById('db-show-inactive').checked = false; }
    renderDBTable();
  });
  document.getElementById('db-show-inactive').addEventListener('change', e => {
    estado.dbShowInactive = e.target.checked;
    if (estado.dbShowInactive) { estado.dbShowActive = false; document.getElementById('db-show-active').checked = false; }
    renderDBTable();
  });

  // Botones clear en buscadores
  document.getElementById('db-search-clear').addEventListener('click', () => {
    const inp = document.getElementById('db-search');
    inp.value = ''; estado.dbSearchText = '';
    inp.closest('.search-wrap').classList.remove('has-text');
    inp.focus(); renderDBTable();
  });

  // Acordeon Base de Datos (event delegation sobre tbody -- persiste entre renders)
  // Enter guarda el comentario (Shift+Enter no hace falta: cada comentario es una viñeta).
  document.getElementById('db-tbody').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('nota-textarea')) {
      e.preventDefault();
      e.target.closest('.nota-edit-section').querySelector('[data-nota-row]').click();
    } else if (e.key === 'Escape' && e.target.classList.contains('nota-textarea')) {
      e.target.closest('.nota-edit-section').querySelector('[data-nota-cancel]').click();
    }
  });
  document.getElementById('db-tbody').addEventListener('click', async e => {
    const byId = id => estado.entries && estado.entries.find(en => en.id === id);

    // ── Editar alquiler ──
    const editBtn = e.target.closest('[data-edit-row]');
    if (editBtn) {
      e.stopPropagation();
      const entry = byId(+editBtn.dataset.editRow);
      if (entry) showEditModal(entry);
      return;
    }

    // ── Marcar inactivo ──
    const delBtn = e.target.closest('[data-delete-row]');
    if (delBtn) {
      e.stopPropagation();
      await deleteEntry(+delBtn.dataset.deleteRow, delBtn.dataset.deleteDir);
      return;
    }

    // ── Desmarcar renovacion desde el panel DB ──
    const dbVunc = e.target.closest('[data-db-vunc]');
    if (dbVunc) {
      e.stopPropagation();
      const dir = dbVunc.dataset.dbVunc;
      delete estado.marks[`v|${dir}`];
      delete estado.marks[`vr|${dir}`];
      guardarMarcas();
      renderDBTable();
      return;
    }
    const dbVuncR = e.target.closest('[data-db-vunc-r]');
    if (dbVuncR) {
      e.stopPropagation();
      delete estado.marks[`vr|${dbVuncR.dataset.dbVuncR}`];
      guardarMarcas();
      renderDBTable();
      return;
    }

    // ── Linea de tiempo ──
    const tlBtn = e.target.closest('[data-timeline]');
    if (tlBtn) { e.stopPropagation(); showTimeline(byId(+tlBtn.dataset.timeline)); return; }

    // ── Comentarios como viñetas: agregar, corregir, borrar ──
    // Los indices son sobre la lista completa (incluye las notas de renovacion, que no se muestran).
    const notaSec = e.target.closest('.nota-edit-section');
    const openNew = (sec, text, idx) => {
      const box = sec.querySelector('.nota-new'), ta = box.querySelector('textarea');
      box.hidden = false; sec.querySelector('.nota-bar').hidden = true;
      ta.value = text || ''; ta.dataset.i = idx == null ? '' : idx; ta.focus();
    };
    if (e.target.closest('[data-nota-add]')) { e.stopPropagation(); openNew(notaSec); return; }
    const notaEdit = e.target.closest('[data-nota-edit]');
    if (notaEdit) {
      e.stopPropagation();
      if (document.body.classList.contains('viewer')) return;
      const entry = byId(+notaEdit.dataset.notaEdit);
      openNew(notaSec, D.separarNotas(entry.notas)[+notaEdit.dataset.i], +notaEdit.dataset.i);
      return;
    }
    if (e.target.closest('[data-nota-cancel]')) {
      e.stopPropagation();
      notaSec.querySelector('.nota-new').hidden = true; notaSec.querySelector('.nota-bar').hidden = false;
      return;
    }
    const notaDel = e.target.closest('[data-nota-del]');
    if (notaDel) {
      e.stopPropagation();
      const entry = byId(+notaDel.dataset.notaDel);
      const list = D.separarNotas(entry.notas);
      if (!confirm(`¿Borrar este comentario?\n\n${list[+notaDel.dataset.i]}`)) return;
      list.splice(+notaDel.dataset.i, 1);
      if (await saveNotes(entry, list.join(' | '), '&#10003; Comentario borrado')) renderDBTable();
      return;
    }
    const notaBtn = e.target.closest('[data-nota-row]');
    if (notaBtn) {
      e.stopPropagation();
      const entry = byId(+notaBtn.dataset.notaRow);
      if (!entry) return;
      const ta = notaBtn.closest('.nota-edit-section').querySelector('.nota-textarea');
      const txt = ta.value.replace(/\s*\n+\s*/g, ' ').replace(/\s*\|\s*/g, ' - ').trim();
      const list = D.separarNotas(entry.notas);
      if (ta.dataset.i !== '') { if (txt) list[+ta.dataset.i] = txt; else list.splice(+ta.dataset.i, 1); }
      else if (txt) list.push(txt);
      if (await saveNotes(entry, list.join(' | '), '&#10003; Comentario guardado')) renderDBTable();
      return;
    }

    // ── Toggle acordeon (no si el click fue dentro de los comentarios) ──
    if (notaSec) return;
    const row = e.target.closest('.db-row');
    if (!row) return;
    const id = +row.dataset.id;
    const detRow = document.querySelector(`.db-detail-row[data-detail-id="${id}"]`);
    if (estado.expandedRows.has(id)) {
      estado.expandedRows.delete(id);
      row.classList.remove('expanded');
      if (detRow) detRow.remove();
    } else {
      estado.expandedRows.add(id);
      row.classList.add('expanded');
      const entry = byId(id);
      if (!detRow && entry) row.insertAdjacentHTML('afterend', filaDetalle(entry, D.indicePorDireccion(estado.entries)));
    }
  });
}
