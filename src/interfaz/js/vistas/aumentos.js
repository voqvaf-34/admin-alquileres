// Pestaña Aumentos: que alquileres aumentan en el mes, tarjetas y acciones (enviado, no aumenta).
import * as D from '../../../dominios/index.js';
import { claveAumento, formatearFecha, claveNoAumenta } from '../../../dominios/index.js';
import { render } from '../app.js';
import { call } from '../nucleo/api.js';
import { appendNote, entryByDir, obtenerAumentos, esAumentoResuelto, saveIncrease, saveMarks, saveNotes } from '../nucleo/datos.js';
import { copyToClipboard, esc, showToast } from '../nucleo/dom.js';
import { estado, replaceEntry } from '../nucleo/estado.js';
import { MONTH_NAMES, fmtIPC, fmtMoney, fmtNames, fmtNotas } from '../nucleo/formato.js';
import { datosPersonas, filtroResueltos, mesSiguiente, pendientes } from './tarjetas.js';

// Aumentos resueltos (enviado / no aumenta): una linea con el resumen; al tocarla se despliega
// el detalle con la opcion de deshacer (asi un clic de mas no deshace nada).
const aumAbiertos = new Set();   // claves de marca de las tarjetas resueltas desplegadas

function cardAumentoCompact(e, m, y) {
  const key  = claveAumento(e, m, y);
  const mk   = estado.marks[key];
  const naKy = claveNoAumenta(e, m, y);
  const naMk = estado.marks[naKy];
  if (!mk && !naMk) return '';
  const k = mk ? key : naKy;
  const abierto = aumAbiertos.has(k);
  const resumen = mk
    ? `&#10003; Enviado ${mk.date}${mk.importeAnterior ? ` &middot; ${fmtMoney(mk.importeAnterior, e.moneda)} &rarr; ${fmtMoney(mk.importeNuevo, e.moneda)}` : ''}`
    : `&#10005; No aumenta${naMk.desc ? ' &mdash; ' + esc(naMk.desc) : ''} &middot; ${naMk.date}`;
  const datos = mk
    ? `<div><span class="lbl">Alquiler: </span>${mk.importeAnterior
          ? `${fmtMoney(mk.importeAnterior, e.moneda)} &rarr; <strong>${fmtMoney(mk.importeNuevo, e.moneda)}</strong>`
          : fmtMoney(e.importe, e.moneda)}</div>
       <div><span class="lbl">IPC aplicado: </span>${mk.ipc != null && mk.ipc !== '' ? fmtIPC(+mk.ipc) : '-'}</div>
       <div><span class="lbl">Enviado: </span>${mk.date}</div>`
    : `<div class="full"><span class="lbl">Motivo: </span>${naMk.desc ? esc(naMk.desc) : '-'}</div>
       <div><span class="lbl">Marcado: </span>${naMk.date}</div>`;
  const detalle = !abierto ? '' : `
      <div class="card-grid">
        <div><span class="lbl">Inq: </span>${fmtNames(e.inquilino)}</div>
        <div><span class="lbl">Prop: </span>${fmtNames(e.propietario)}</div>
        ${datos}
      </div>
      <div class="card-footer">
        <button class="mark-btn" ${mk ? `data-aum-undo="${esc(key)}"` : `data-un-na="${esc(naKy)}"`}>&#8617; Deshacer${mk ? ' enviado' : ''}</button>
      </div>`;
  return `<div class="card card-compact${abierto ? ' abierta' : ''}" style="border-left:3px solid ${mk ? 'var(--green)' : 'rgba(150,150,150,0.3)'}">
      <div class="card-compact-row aum-toggle" data-aum-toggle="${esc(k)}" title="${abierto ? 'Cerrar' : 'Ver el detalle'}">
        <span class="titulo-compacto">${esc(e.direccion)}</span>
        <span class="meta-chica">${resumen}</span>
        <span class="aum-chevron">${abierto ? '&#9660;' : '&#9658;'}</span>
      </div>${detalle}
    </div>`;
}

function footerAumento(e, m, y, ipcVal) {
  const nuevo    = D.nuevoImporte(e.importe, ipcVal);
  const key      = claveAumento(e, m, y);
  const naKy     = claveNoAumenta(e, m, y);
  const mk       = estado.marks[key];
  const naMk     = estado.marks[naKy];
  const ipcStr   = fmtIPC(ipcVal);
  const nuevoStr = fmtMoney(nuevo, e.moneda);

  if (D.gestionadoPor(e)) {
    return `<div class="card-footer">
      <span class="delegado-badge">Delegado &rarr; ${esc(D.gestionadoPor(e))}</span>
      <span style="font-size:11px;color:var(--dim)">Excluido de cola personal</span>
    </div>`;
  }

  const { inquilino: msgInq, propietario: msgProp } = D.mensajesAumento({ settings: estado.appSettings, contrato: e, porcentaje: ipcStr, nuevoImporte: nuevoStr });

  const copyBtns = `
    <button class="copy-btn" data-copy="${esc(msgInq)}"  title="Copiar mensaje inquilino">&#8663; Inq</button>
    <button class="copy-btn" data-copy="${esc(msgProp)}" title="Copiar mensaje propietario">&#8663; Prop</button>`;

  // Ya enviado
  if (mk) {
    return `<div class="card-footer">
      <label class="chk-wrap done">
        <input type="checkbox" class="chk" data-aum="${esc(key)}" checked>
        Enviado ${mk.date}
      </label>
      ${mk.importeAnterior ? `<span class="change-tag">${fmtMoney(mk.importeAnterior, e.moneda)} &rarr; ${fmtMoney(mk.importeNuevo, e.moneda)}</span>` : ''}
      ${copyBtns}
    </div>`;
  }

  // Marcado como "no aumenta"
  if (naMk) {
    return `<div class="card-footer">
      <span style="font-size:12px;color:var(--dim)">&#10005; No aumenta${naMk.desc ? ' &mdash; ' + esc(naMk.desc) : ''} <span style="font-size:10px;color:var(--dim)">${naMk.date}</span></span>
      <button class="unmark-btn" data-un-na="${esc(naKy)}" title="Deshacer" style="font-size:14px">&#8617;</button>
    </div>`;
  }

  // Esperando descripcion de "no aumenta"
  if (pendientes.noAumenta === naKy) {
    return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="inp-na-desc" placeholder="Descripcion (opcional, se guarda en comentarios)" class="date-inp" style="flex:1;min-width:160px">
      <button class="mark-btn" data-na-conf="${esc(naKy)}">&#10003; Confirmar</button>
      <button class="mark-btn" data-na-cancel style="color:var(--dim)">&#10005;</button>
    </div>`;
  }

  // Estado normal
  return `<div class="card-footer">
    <label class="chk-wrap">
      <input type="checkbox" class="chk" data-aum="${esc(key)}">
      Marcar enviado
    </label>
    <button class="mark-btn" data-na-start="${esc(naKy)}" style="font-size:11px;border-color:rgba(var(--red-rgb),0.35);color:var(--red)">&#10005; No aumenta</button>
    ${copyBtns}
  </div>`;
}

function cardAumento(e, m, y, ipcVal) {
  const nuevo  = D.nuevoImporte(e.importe, ipcVal);
  const diff   = nuevo - e.importe;
  const years  = y - e.fechaInicio.getFullYear();
  const cardKey = claveAumento(e, m, y);
  const mk     = estado.marks[cardKey];
  const naMk   = estado.marks[claveNoAumenta(e, m, y)];
  const isDel  = Boolean(D.gestionadoPor(e));
  const borderColor = mk ? 'var(--green)' : naMk ? 'rgba(150,150,150,0.3)' : isDel ? 'var(--amber)' : D.comentarios(e).length ? 'var(--orange)' : 'rgba(var(--accent-rgb),0.3)';
  return `
    <div class="card" data-card-key="${esc(cardKey)}" style="border-left:3px solid ${borderColor}${naMk ? ';filter:grayscale(1)' : ''}">
      <div class="card-top">
        <div>
          <span style="color:${isDel ? 'var(--amber)' : 'var(--accent-ink)'};font-weight:600">${esc(e.direccion)}</span>
          <span style="color:var(--dim);margin-left:10px;font-size:11px">${years}a</span>
          ${isDel ? `<span class="delegado-badge" style="margin-left:8px">&#8618; ${esc(D.gestionadoPor(e))}</span>` : ''}
        </div>
        <div style="text-align:right;white-space:nowrap">
          <span style="color:var(--dim)">${fmtMoney(e.importe, e.moneda)}</span>
          <span style="margin:0 6px;color:var(--dim)">&rarr;</span>
          <span style="color:var(--green);font-weight:600">${fmtMoney(nuevo, e.moneda)}</span>
          <span style="font-size:11px;color:var(--dim);margin-left:6px">(+${fmtMoney(diff, e.moneda)})</span>
        </div>
      </div>
      ${datosPersonas(e, { conMail: true })}
      <div class="card-meta">Inicio: ${formatearFecha(e.fechaInicio)}${e.ultimoAumento ? ` &middot; Ultimo aumento: ${formatearFecha(e.ultimoAumento)}` : ''} &middot; Contrato: ${esc(e.contratoStr||'-')}</div>
      ${fmtNotas(e)}
      ${footerAumento(e, m, y, ipcVal)}
    </div>`;
}

// Aumentos del mes elegido que faltan resolver (el circulito de la pestaña).
export function contarPendientesAumentos() {
  return obtenerAumentos(estado.entries, estado.selMonth, estado.selYear)
    .filter(e => !esAumentoResuelto(e, estado.selMonth, estado.selYear)).length;
}

// Lista del mes elegido y del siguiente, con el filtro de resueltos.
export function renderAumentos(content) {
  const { m: nxM, y: nxY } = mesSiguiente(estado.selMonth, estado.selYear);
  const aumentos     = obtenerAumentos(estado.entries, estado.selMonth, estado.selYear);
  const aumentosProx = obtenerAumentos(estado.entries, nxM, nxY);
  const filtro = filtroResueltos();
  const showPend = filtro.pendientes, showResv = filtro.resueltos;
  const aumPend  = aumentos.filter(e => !esAumentoResuelto(e, estado.selMonth, estado.selYear));
  const aumResv  = aumentos.filter(e =>  esAumentoResuelto(e, estado.selMonth, estado.selYear));
  const proxPend = aumentosProx.filter(e => !esAumentoResuelto(e, nxM, nxY));
  const proxResv = aumentosProx.filter(e =>  esAumentoResuelto(e, nxM, nxY));

  let h = `<div class="sec-title">${MONTH_NAMES[estado.selMonth]} ${estado.selYear}</div>`;
  const visibleAum  = (showPend ? aumPend  : []).concat(showResv ? aumResv  : []);
  const visibleProx = (showPend ? proxPend : []).concat(showResv ? proxResv : []);
  if (visibleAum.length === 0) {
    h += `<div class="empty">Sin aumentos ${filtro.palabra} este mes</div>`;
  } else {
    if (showPend && aumPend.length)  h += `<div class="card-list">${aumPend.map(e=>cardAumento(e,estado.selMonth,estado.selYear,estado.ipc)).join('')}</div>`;
    if (showResv && aumResv.length)  h += `<div class="card-list">${aumResv.map(e=>cardAumentoCompact(e,estado.selMonth,estado.selYear)).join('')}</div>`;
  }
  if (visibleProx.length > 0) {
    h += `<div class="sec-title sep">Proximo: ${MONTH_NAMES[nxM]} ${nxY} (${visibleProx.length})</div>`;
    if (showPend && proxPend.length) h += `<div class="card-list dim">${proxPend.map(e=>cardAumento(e,nxM,nxY,estado.ipc)).join('')}</div>`;
    if (showResv && proxResv.length) h += `<div class="card-list dim">${proxResv.map(e=>cardAumentoCompact(e,nxM,nxY)).join('')}</div>`;
  }
  content.innerHTML = h;
}

// "Marcar enviado": aplica el aumento al alquiler y guarda la marca (con el importe anterior,
// para poder deshacer).
async function marcarAumentoEnviado(key) {
  const entry = entryByDir(key.split('|')[1]);
  if (!entry) return;
  const today     = new Date();
  const newAmount = D.nuevoImporte(entry.importe, estado.ipc);
  const prev = { importeAnterior: entry.importe, ultimoAumentoAnterior: D.aFechaISO(entry.ultimoAumento) };
  if (await saveIncrease(entry, newAmount, today)) {
    estado.marks[key] = { date: formatearFecha(today), importeNuevo: newAmount, ipc: estado.ipc, ...prev };
    await saveMarks();
  }
}

// Deshacer "enviado": vuelve el alquiler al importe anterior y saca la marca.
async function deshacerAumentoEnviado(key) {
  const entry = entryByDir(key.split('|')[1]);
  const mk = estado.marks[key];
  // Revierte el importe solo si la marca guardo el estado previo (las importadas no lo tienen).
  if (entry && mk && mk.importeAnterior) {
    try {
      replaceEntry(await call('patchContract', entry.id,
        { importe: mk.importeAnterior, ultimoAumento: mk.ultimoAumentoAnterior || null }));
    } catch (err) {
      showToast('Error al revertir el aumento: ' + esc(err.message), 'err');
      return false;
    }
  }
  delete estado.marks[key];
  await saveMarks();
  return true;
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.getElementById('content').addEventListener('change', async e => {
    const chk = e.target.closest('[data-aum]');
    if (!chk) return;
    chk.disabled = true;
    if (chk.checked) await marcarAumentoEnviado(chk.dataset.aum);
    else await deshacerAumentoEnviado(chk.dataset.aum);
    render();
  });

  document.getElementById('content').addEventListener('click', async e => {
    // ── aumentos resueltos: desplegar el detalle / deshacer ─────────────────────
    const aumUndo = e.target.closest('[data-aum-undo]');
    if (aumUndo) {
      aumUndo.disabled = true;
      if (await deshacerAumentoEnviado(aumUndo.dataset.aumUndo)) {
        aumAbiertos.delete(aumUndo.dataset.aumUndo);
        showToast('&#8617; Aumento deshecho: el alquiler volvió al importe anterior', 'info');
      }
      render();
      return;
    }
    const aumToggle = e.target.closest('[data-aum-toggle]');
    if (aumToggle) {
      const k = aumToggle.dataset.aumToggle;
      if (aumAbiertos.has(k)) aumAbiertos.delete(k); else aumAbiertos.add(k);
      render();
      return;
    }

    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      copyToClipboard(copyBtn.dataset.copy);
      copyBtn.classList.add('copied');
      const orig = copyBtn.textContent;
      copyBtn.textContent = '✓';
      setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove('copied'); }, 1800);
      return;
    }

    // ── na-start (iniciar "no aumenta") ──────────────────────────────────────
    const naStart = e.target.closest('[data-na-start]');
    if (naStart) {
      pendientes.noAumenta = naStart.dataset.naStart;
      pendientes.noRenueva = null;
      render();
      setTimeout(() => { const el = document.getElementById('inp-na-desc'); if (el) el.focus(); }, 50);
      return;
    }
    if (e.target.closest('[data-na-cancel]')) { pendientes.noAumenta = null; render(); return; }

    // ── na-conf (confirmar no aumenta) ────────────────────────────────────────
    const naConf = e.target.closest('[data-na-conf]');
    if (naConf) {
      const naKy   = naConf.dataset.naConf;
      const descEl = document.getElementById('inp-na-desc');
      const desc   = descEl ? descEl.value.trim() : '';
      const entry  = entryByDir(naKy.split('|')[1]);   // na|dir|m|y
      estado.marks[naKy]  = { date: formatearFecha(new Date()), desc };
      saveMarks();
      pendientes.noAumenta = null;
      if (entry && desc) await saveNotes(entry, appendNote(entry, `NO AUMENTA: ${desc}`));
      render();
      return;
    }

    // ── un-na (deshacer no aumenta) ───────────────────────────────────────────
    const unNa = e.target.closest('[data-un-na]');
    if (unNa) { delete estado.marks[unNa.dataset.unNa]; saveMarks(); render(); return; }

  });
}
