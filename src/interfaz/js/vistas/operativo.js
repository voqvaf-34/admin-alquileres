// Pestañas Aumentos y Renovaciones: tarjetas y acciones (enviado, renovado, no renueva...).
import * as D from '../../../dominios/index.js';
import { aumKey, fmtDate, naKey, nrKey, parseDMY, parseISO, realDuration, vncKey, vncKeyR } from '../../../dominios/index.js';
import { render } from '../app.js';
import { call } from '../nucleo/api.js';
import { appendNote, entryByDir, getVencDate, saveIncrease, saveMarks, saveNotes, saveRenewal, vencColor, vencRenewalMsg } from '../nucleo/datos.js';
import { copyToClipboard, esc, showToast } from '../nucleo/dom.js';
import { estado, replaceEntry } from '../nucleo/estado.js';
import { diasFaltan, fmtIPC, fmtMails, fmtMoney, fmtNames, fmtNotas, monthsAgo, telLink } from '../nucleo/formato.js';
import { contactRow } from './propietarios.js';

export let pendingVenc   = null;

export let pendingNoAum  = null;   // naKey activo mientras se espera descripcion de "no aumenta"

export let pendingNoRen  = null;   // dir activo mientras se espera descripcion de "no renueva"

// Al deshacer/rehacer se descartan las acciones a medio cargar (descripcion de "no aumenta", etc.).
export function limpiarPendientes() { pendingVenc = pendingNoAum = pendingNoRen = null; }

// Aumentos resueltos (enviado / no aumenta): una linea con el resumen; al tocarla se despliega
// el detalle con la opcion de deshacer (asi un clic de mas no deshace nada).
const aumAbiertos = new Set();   // claves de marca de las tarjetas resueltas desplegadas

export function cardAumentoCompact(e, m, y) {
  const key  = aumKey(e, m, y);
  const mk   = estado.marks[key];
  const naKy = naKey(e, m, y);
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

export function cardVencCompact(e) {
  const mk = estado.marks[vncKey(e)];
  const isRenCycle = !!(mk && mk.nuevaInicio && mk.renewYears);
  const activeMk = isRenCycle ? estado.marks[vncKeyR(e)] : mk;
  const nrMk = estado.marks[nrKey(e)];
  if (activeMk) {
    const undoAttr = isRenCycle ? `data-un-ren-r="${esc(e.direccion)}"` : `data-un-ren="${esc(e.direccion)}"`;
    return `<div class="card card-compact" style="border-left:3px solid var(--green)">
      <div class="card-compact-row">
        <span class="titulo-compacto">${esc(e.direccion)}</span>
        <span class="meta-chica">&#10003; Renovado ${activeMk.date}${activeMk.nuevaInicio ? ' &middot; ' + activeMk.nuevaInicio + ' &middot; ' + activeMk.renewYears + 'a' : ''}</span>
        <button class="unmark-btn" ${undoAttr} title="Deshacer">&#8617;</button>
      </div>
    </div>`;
  }
  if (nrMk) {
    return `<div class="card card-compact" style="border-left:3px solid rgba(150,150,150,0.3)">
      <div class="card-compact-row">
        <span class="titulo-compacto">${esc(e.direccion)}</span>
        <span class="meta-chica">&#10005; No renueva${nrMk.sigueActivo ? ' (sigue activo)' : ''}${nrMk.desc ? ' &mdash; ' + esc(nrMk.desc) : ''} &middot; ${nrMk.date}</span>
        <button class="unmark-btn" data-un-nr="${esc(e.direccion)}" title="Deshacer">&#8617;</button>
      </div>
    </div>`;
  }
  return '';
}

export function footerAumento(e, m, y, ipcVal) {
  const nuevo    = Math.floor(e.importe * (1 + ipcVal/100));
  const key      = aumKey(e, m, y);
  const naKy     = naKey(e, m, y);
  const mk       = estado.marks[key];
  const naMk     = estado.marks[naKy];
  const ipcStr   = fmtIPC(ipcVal);
  const nuevoStr = fmtMoney(nuevo, e.moneda);

  if (D.gestionadoPor(e)) {
    return `<div class="card-footer">
      <span class="delegado-badge">Delegado &rarr; ${esc(D.gestionadoPor(e))}</span>
      <span style="font-size:11px;opacity:0.35">Excluido de cola personal</span>
    </div>`;
  }

  const { inquilino: msgInq, propietario: msgProp } = D.increaseMessages({ settings: estado.appSettings, contrato: e, porcentaje: ipcStr, nuevoImporte: nuevoStr });

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
    <button class="mark-btn" data-na-start="${esc(naKy)}" style="opacity:0.55;font-size:11px;border-color:rgba(var(--red-rgb),0.2);color:rgba(var(--red-rgb),0.6)">&#10005; No aumenta</button>
    ${copyBtns}
  </div>`;
}

// Genera el bloque de inputs de fecha + plazo para una renovacion pendiente
export function _vencInputs(defaultYears, confirmAttr, dirEsc) {
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

export function footerVenc(e) {
  const mk          = estado.marks[vncKey(e)];
  const isRenCycle  = !!(mk && mk.nuevaInicio && mk.renewYears); // ya fue renovado -> ciclo post-renovacion
  const mkR         = estado.marks[vncKeyR(e)];                          // mark del ciclo post-renovacion

  // ── CICLO POST-RENOVACION ─────────────────────────────────────────────────
  if (isRenCycle) {
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
        <span class="venc-done-label">&#10003; Renovado ${mkR.date}</span>
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
        <button class="unmark-btn" style="font-size:11px;opacity:0.4;border:1px solid rgba(var(--fg),0.1);padding:2px 8px;border-radius:4px" data-vunc="${esc(e.direccion)}" title="Deshacer 1er renovacion">&#8617; Deshacer</button>
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
    return `<div class="card-footer">
      <span class="venc-done-label">&#10003; Renovado ${mk.date}</span>
      ${nuevaInfo}
      <button class="unmark-btn" data-vunc="${esc(e.direccion)}" title="Desmarcar">&times;</button>
    </div>`;
  }

  // ── NO RENUEVA ──────────────────────────────────────────────────────────────
  const nrMk = estado.marks[nrKey(e)];
  if (nrMk && D.noRenuevaVigente(e, estado.marks)) {
    return `<div class="card-footer">
      <span style="font-size:12px;opacity:0.55">&#10005; No renueva${nrMk.sigueActivo ? ' (sigue activo)' : ''}${nrMk.desc ? ' &mdash; ' + esc(nrMk.desc) : ''} <span style="font-size:10px;opacity:0.45">${nrMk.date}</span></span>
      <button class="unmark-btn" data-un-nr="${esc(e.direccion)}" title="Deshacer" style="font-size:14px">&#8617;</button>
    </div>`;
  }
  // Ciclo nuevo de un contrato que no renovo pero sigue: se vuelve a avisar.
  const sigueInfo = nrMk ? `<div style="font-size:11px;color:var(--amber);width:100%">No renovó el ${nrMk.date} y sigue en el apto: corresponde volver a ofrecer la renovación.</div>` : '';

  if (pendingNoRen === e.direccion) {
    return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="inp-nr-desc" placeholder="Descripcion (opcional, se guarda en comentarios)" class="date-inp" style="flex:1;min-width:160px">
      <label class="db-chk-label" style="opacity:0.85" title="Si sigue, se le sigue avisando el IPC y la renovacion cada año. Si no, el alquiler pasa a inactivo.">
        <input type="checkbox" id="inp-nr-sigue"> Sigue en el apto (seguir avisando IPC y renovación)
      </label>
      <button class="mark-btn" data-nr-conf="${esc(e.direccion)}">&#10003; Confirmar</button>
      <button class="mark-btn" data-nr-cancel style="opacity:0.5">&#10005;</button>
      <div class="field-hint" style="width:100%">Si no sigue en el apto, el alquiler se marca como inactivo (se puede deshacer).</div>
    </div>`;
  }

  const defaultYears = realDuration(e.contratoDuracion) || 2;
  if (pendingVenc === e.direccion) {
    return _vencInputs(defaultYears, 'data-vconf', esc(e.direccion));
  }

  return `<div class="card-footer" style="flex-wrap:wrap">
    ${sigueInfo}
    <button class="mark-btn" data-vstart="${esc(e.direccion)}">Marcar renovado</button>
    <button class="mark-btn" data-nr-start="${esc(e.direccion)}" style="opacity:0.55;font-size:11px;border-color:rgba(var(--red-rgb),0.2);color:rgba(var(--red-rgb),0.6)">&#10005; No renueva</button>
  </div>`;
}

export function cardAumento(e, m, y, ipcVal) {
  const mult   = 1 + ipcVal/100;
  const nuevo  = Math.floor(e.importe * mult);
  const diff   = nuevo - e.importe;
  const years  = y - e.fechaInicio.getFullYear();
  const cardKey = aumKey(e, m, y);
  const mk     = estado.marks[cardKey];
  const naMk   = estado.marks[naKey(e, m, y)];
  const isDel  = Boolean(D.gestionadoPor(e));
  const borderColor = mk ? "var(--green)" : naMk ? "rgba(150,150,150,0.3)" : isDel ? "var(--amber)" : D.comentarios(e).length ? "var(--orange)" : "rgba(var(--accent-rgb),0.3)";
  return `
    <div class="card" data-card-key="${esc(cardKey)}" style="border-left:3px solid ${borderColor}${naMk ? ';filter:grayscale(1) opacity(0.5)' : ''}">
      <div class="card-top">
        <div>
          <span style="color:${isDel ? 'var(--amber)' : 'var(--accent)'};font-weight:600">${esc(e.direccion)}</span>
          <span style="opacity:0.3;margin-left:10px;font-size:11px">${years}a</span>
          ${isDel ? `<span class="delegado-badge" style="margin-left:8px">&#8618; ${esc(D.gestionadoPor(e))}</span>` : ''}
        </div>
        <div style="text-align:right;white-space:nowrap">
          <span style="opacity:0.5">${fmtMoney(e.importe, e.moneda)}</span>
          <span style="margin:0 6px;opacity:0.2">&rarr;</span>
          <span style="color:var(--green);font-weight:600">${fmtMoney(nuevo, e.moneda)}</span>
          <span style="font-size:11px;opacity:0.5;margin-left:6px">(+${fmtMoney(diff, e.moneda)})</span>
        </div>
      </div>
      <div class="card-grid">
        <div><span class="lbl">Inq: </span>${fmtNames(e.inquilino)}</div>
        <div><span class="lbl">Prop: </span>${fmtNames(e.propietario)}</div>
        <div><span class="lbl">Tel: </span>${telLink(e.telInq)}</div>
        <div><span class="lbl">Tel: </span>${telLink(e.telProp)}</div>
        ${contactRow(e, 'full')}
        ${e.mailInq?`<div class="full"><span class="lbl">Mail: </span>${fmtMails(e.mailInq)}</div>`:""}
      </div>
      <div class="card-meta">Inicio: ${fmtDate(e.fechaInicio)}${e.ultimoAumento ? ` &middot; Ultimo aumento: ${fmtDate(e.ultimoAumento)}` : ""} &middot; Contrato: ${esc(e.contratoStr||"-")}</div>
      ${fmtNotas(e)}
      ${footerAumento(e, m, y, ipcVal)}
    </div>`;
}

export function cardVenc(e, color, overdue) {
  color = color || vencColor(e);
  const mk          = estado.marks[vncKey(e)];
  const mkR         = estado.marks[vncKeyR(e)];
  const isRenCycle  = !!(mk && mk.nuevaInicio && mk.renewYears);
  const vd          = getVencDate(e) || new Date(0);
  const activeMk    = isRenCycle ? mkR : mk;
  const nrMkC       = estado.marks[nrKey(e)];
  const bcolor      = activeMk ? "var(--green)" : nrMkC ? "rgba(150,150,150,0.3)" : color;
  const inicioLabel = `Inicio original: ${fmtDate(e.fechaInicio)}`;
  const overdueTag  = overdue
    ? `<span style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--red);background:rgba(var(--red-rgb),0.12);border:1px solid rgba(var(--red-rgb),0.3);border-radius:3px;padding:1px 6px;margin-left:6px;vertical-align:middle">VENCIDO ${monthsAgo(vd)}</span>`
    : '';
  return `
    <div class="card" style="border-left:3px solid ${bcolor}${nrMkC ? ';filter:grayscale(1) opacity(0.5)' : ''}">
      <div class="card-top">
        <span style="color:${bcolor};font-weight:600">${esc(e.direccion)}${overdueTag}</span>
        <span class="badge" style="background:color-mix(in srgb, ${color} 13%, transparent);color:${color}">Vence ${fmtDate(vd)}${diasFaltan(vd)}</span>
      </div>
      <div class="card-grid">
        <div><span class="lbl">Inq: </span>${fmtNames(e.inquilino)}</div>
        <div><span class="lbl">Prop: </span>${fmtNames(e.propietario)}</div>
        <div><span class="lbl">Tel: </span>${telLink(e.telInq)}</div>
        <div><span class="lbl">Tel: </span>${telLink(e.telProp)}</div>
        ${contactRow(e, 'full')}
      </div>
      <div class="card-meta">${inicioLabel} &middot; Contrato: ${esc(e.contratoStr||"-")} &middot; Alquiler: ${fmtMoney(e.importe, e.moneda)}</div>
      ${fmtNotas(e)}
      <div style="padding:4px 0 2px">
        <button class="mark-btn" data-copy-venc-msg="${esc(vencRenewalMsg(e))}" style="font-size:11px">&#128203; Copiar aviso de renovaci&oacute;n</button>
      </div>
      ${footerVenc(e)}
    </div>`;
}

// Helper para leer los inputs de fecha/plazo del footer de vencimiento
export function _readVencInputs(defaultYears) {
  const inp     = document.getElementById("inp-venc-date");
  const yearsEl = document.getElementById("inp-venc-years");
  const descEl  = document.getElementById("inp-venc-desc");
  const dateV   = inp ? inp.value : "";
  const d       = dateV ? parseISO(dateV) : null;
  const years   = yearsEl ? +yearsEl.value : defaultYears;
  const desc    = descEl ? descEl.value.trim() : '';
  return { d, years, desc };
}

// "Marcar enviado": aplica el aumento al alquiler y guarda la marca (con el importe anterior,
// para poder deshacer).
async function marcarAumentoEnviado(key) {
  const entry = entryByDir(key.split('|')[1]);
  if (!entry) return;
  const today     = new Date();
  const newAmount = D.nuevoImporte(entry.importe, estado.ipc);
  const prev = { importeAnterior: entry.importe, ultimoAumentoAnterior: D.toISODate(entry.ultimoAumento) };
  if (await saveIncrease(entry, newAmount, today)) {
    estado.marks[key] = { date: fmtDate(today), importeNuevo: newAmount, ipc: estado.ipc, ...prev };
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
  document.getElementById("content").addEventListener("change", async e => {
    const chk = e.target.closest("[data-aum]");
    if (!chk) return;
    chk.disabled = true;
    if (chk.checked) await marcarAumentoEnviado(chk.dataset.aum);
    else await deshacerAumentoEnviado(chk.dataset.aum);
    render();
  });

  document.getElementById("content").addEventListener("click", async e => {
    // ── aumentos resueltos: desplegar el detalle / deshacer ─────────────────────
    const aumUndo = e.target.closest("[data-aum-undo]");
    if (aumUndo) {
      aumUndo.disabled = true;
      if (await deshacerAumentoEnviado(aumUndo.dataset.aumUndo)) {
        aumAbiertos.delete(aumUndo.dataset.aumUndo);
        showToast('&#8617; Aumento deshecho: el alquiler volvió al importe anterior', 'info');
      }
      render();
      return;
    }
    const aumToggle = e.target.closest("[data-aum-toggle]");
    if (aumToggle) {
      const k = aumToggle.dataset.aumToggle;
      if (aumAbiertos.has(k)) aumAbiertos.delete(k); else aumAbiertos.add(k);
      render();
      return;
    }

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
      const entry  = entryByDir(naKy.split('|')[1]);   // na|dir|m|y
      estado.marks[naKy]  = { date: fmtDate(new Date()), desc };
      saveMarks();
      pendingNoAum = null;
      if (entry && desc) await saveNotes(entry, appendNote(entry, `NO AUMENTA: ${desc}`));
      render();
      return;
    }

    // ── un-na (deshacer no aumenta) ───────────────────────────────────────────
    const unNa = e.target.closest("[data-un-na]");
    if (unNa) { delete estado.marks[unNa.dataset.unNa]; saveMarks(); render(); return; }

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
      const sigue  = !!(document.getElementById('inp-nr-sigue') || {}).checked;
      const entry  = entryByDir(dir);
      const vd     = entry ? getVencDate(entry) : null;
      estado.marks[`nr|${dir}`] = { date: fmtDate(new Date()), desc, sigueActivo: sigue, hasta: vd ? D.toISODate(vd) : '' };
      await saveMarks();
      pendingNoRen = null;
      if (entry && desc) await saveNotes(entry, appendNote(entry, `NO RENUEVA${sigue ? ' (sigue en el apto)' : ''}: ${desc}`));
      if (entry && !sigue) {
        try { replaceEntry(await call('inactivate', entry.id)); showToast('No renueva: el alquiler pasó a inactivo (Ctrl+Z para deshacer)', 'info'); }
        catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
      }
      render();
      return;
    }

    // ── un-nr (deshacer no renueva) ───────────────────────────────────────────
    const unNr = e.target.closest("[data-un-nr]");
    if (unNr) { delete estado.marks[`nr|${unNr.dataset.unNr}`]; saveMarks(); render(); return; }

    // ── copiar aviso de renovacion ───────────────────────────────────────────
    const copyVenc = e.target.closest("[data-copy-venc-msg]");
    if (copyVenc) {
      copyToClipboard(copyVenc.dataset.copyVencMsg);
      const orig = copyVenc.innerHTML;
      copyVenc.innerHTML = "&#10003; Copiado";
      copyVenc.style.color = "var(--green)";
      setTimeout(() => { copyVenc.innerHTML = orig; copyVenc.style.color = ""; }, 1800);
      return;
    }

    // ── un-ren / un-ren-r (deshacer renovacion desde card compacto) ──────────
    const unRen = e.target.closest("[data-un-ren]");
    if (unRen) { delete estado.marks[`v|${unRen.dataset.unRen}`]; saveMarks(); render(); return; }
    const unRenR = e.target.closest("[data-un-ren-r]");
    if (unRenR) { delete estado.marks[`vr|${unRenR.dataset.unRenR}`]; saveMarks(); render(); return; }

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
      const entry  = entryByDir(dir);
      const defY   = entry ? (realDuration(entry.contratoDuracion) || 2) : 2;
      const { d, years, desc } = _readVencInputs(defY);
      delete estado.marks[`nr|${dir}`];   // si no habia renovado pero seguia, ahora renovo
      estado.marks[`v|${dir}`] = { date: fmtDate(new Date()), nuevaInicio: d ? fmtDate(d) : "", renewYears: years };
      saveMarks();
      pendingVenc  = null;
      if (entry) await saveRenewal(entry, years, desc);
      render();
      return;
    }

    // ── vconf-r (ciclo post-renovacion) ───────────────────────────────────────
    const vconfR = e.target.closest("[data-vconf-r]");
    if (vconfR) {
      const dir    = vconfR.dataset.vconfR;
      const entry  = entryByDir(dir);
      const mkPrev = estado.marks[vncKey({ direccion: dir })];
      const defY   = mkPrev ? (mkPrev.renewYears || 2) : 2;
      const { d, years, desc } = _readVencInputs(defY);
      delete estado.marks[`nr|${dir}`];
      estado.marks[`vr|${dir}`] = { date: fmtDate(new Date()), nuevaInicio: d ? fmtDate(d) : "", renewYears: years };
      saveMarks();
      pendingVenc  = null;
      if (entry) await saveRenewal(entry, years, desc);
      render();
      return;
    }

    // ── vunc (desmarcar ciclo original) ──────────────────────────────────────
    const vunc = e.target.closest("[data-vunc]");
    if (vunc) {
      delete estado.marks[`v|${vunc.dataset.vunc}`];
      delete estado.marks[`vr|${vunc.dataset.vunc}`]; // tambien limpia el ciclo R si lo habia
      saveMarks(); render(); return;
    }

    // ── vunc-r (desmarcar solo ciclo post-renovacion) ─────────────────────────
    const vuncR = e.target.closest("[data-vunc-r]");
    if (vuncR) { delete estado.marks[`vr|${vuncR.dataset.vuncR}`]; saveMarks(); render(); return; }
  });
}
