// Pestaña Renovaciones: contratos que vencen, tarjetas y acciones (renovado, no renueva).
import * as D from '../../../dominios/index.js';
import { fmtDate, nrKey, parseDMY, parseISO, realDuration, vncKey, vncKeyR } from '../../../dominios/index.js';
import { render } from '../app.js';
import { call } from '../nucleo/api.js';
import { appendNote, entryByDir, getVencDate, getVencidosAtrasados, getVencimientos, isVencResuelto, saveMarks, saveNotes, saveRenewal, vencColor, vencRenewalMsg } from '../nucleo/datos.js';
import { copyToClipboard, esc, showToast } from '../nucleo/dom.js';
import { estado, replaceEntry } from '../nucleo/estado.js';
import { MONTH_NAMES, diasFaltan, fmtMoney, fmtNotas, monthsAgo } from '../nucleo/formato.js';
import { datosPersonas, filtroResueltos, mesSiguiente, pendientes } from './tarjetas.js';

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

// Genera el bloque de inputs de fecha + plazo para una renovacion pendiente
export function _vencInputs(defaultYears, confirmAttr, dirEsc) {
  return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
    <span style="font-size:11px;color:var(--dim)">Inicio:</span>
    <input type="date" id="inp-venc-date" class="date-inp">
    <span style="font-size:11px;color:var(--dim)">Plazo:</span>
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
      let nuevaInfoR = '';
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
        <span style="font-size:10px;color:var(--dim)">1er ciclo: ${mk.date}</span>
        <button class="unmark-btn" data-vunc-r="${esc(e.direccion)}" title="Desmarcar renovacion">&times;</button>
      </div>`;
    }
    // Pendiente de confirmar ciclo post-renovacion
    if (pendientes.venc === 'R:' + e.direccion) {
      return _vencInputs(mk.renewYears || 2, 'data-vconf-r', esc(e.direccion));
    }
    // Mostrar historial de 1er renovacion + boton para marcar 2da
    const ni = parseDMY(mk.nuevaInicio);
    const nvDate = ni ? fmtDate(new Date(ni.getFullYear()+mk.renewYears, ni.getMonth(), Math.min(ni.getDate(),28))) : '-';
    return `<div class="card-footer" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="font-size:11px;color:var(--amber)">
        Renovado el ${mk.date} &middot; Inicio: ${mk.nuevaInicio} &middot; ${mk.renewYears}a &middot; Vence: ${nvDate}
      </div>
      <div style="display:flex;gap:8px">
        <button class="mark-btn" data-vstart-r="${esc(e.direccion)}">Marcar renovado</button>
        <button class="unmark-btn" style="font-size:11px;color:var(--dim);border:1px solid rgba(var(--fg),0.1);padding:2px 8px;border-radius:4px" data-vunc="${esc(e.direccion)}" title="Deshacer 1er renovacion">&#8617; Deshacer</button>
      </div>
    </div>`;
  }

  // ── CICLO ORIGINAL ─────────────────────────────────────────────────────────
  if (mk) {
    const renewYears = mk.renewYears || realDuration(e.contratoDuracion) || 2;
    let nuevaInfo = '';
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
      <span style="font-size:12px;color:var(--dim)">&#10005; No renueva${nrMk.sigueActivo ? ' (sigue activo)' : ''}${nrMk.desc ? ' &mdash; ' + esc(nrMk.desc) : ''} <span style="font-size:10px;color:var(--dim)">${nrMk.date}</span></span>
      <button class="unmark-btn" data-un-nr="${esc(e.direccion)}" title="Deshacer" style="font-size:14px">&#8617;</button>
    </div>`;
  }
  // Ciclo nuevo de un contrato que no renovo pero sigue: se vuelve a avisar.
  const sigueInfo = nrMk ? `<div style="font-size:11px;color:var(--amber);width:100%">No renovó el ${nrMk.date} y sigue en el apto: corresponde volver a ofrecer la renovación.</div>` : '';

  if (pendientes.noRenueva === e.direccion) {
    return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="inp-nr-desc" placeholder="Descripcion (opcional, se guarda en comentarios)" class="date-inp" style="flex:1;min-width:160px">
      <label class="db-chk-label" style="color:var(--dim)" title="Si sigue, se le sigue avisando el IPC y la renovacion cada año. Si no, el alquiler pasa a inactivo.">
        <input type="checkbox" id="inp-nr-sigue"> Sigue en el apto (seguir avisando IPC y renovación)
      </label>
      <button class="mark-btn" data-nr-conf="${esc(e.direccion)}">&#10003; Confirmar</button>
      <button class="mark-btn" data-nr-cancel style="color:var(--dim)">&#10005;</button>
      <div class="field-hint" style="width:100%">Si no sigue en el apto, el alquiler se marca como inactivo (se puede deshacer).</div>
    </div>`;
  }

  const defaultYears = realDuration(e.contratoDuracion) || 2;
  if (pendientes.venc === e.direccion) {
    return _vencInputs(defaultYears, 'data-vconf', esc(e.direccion));
  }

  return `<div class="card-footer" style="flex-wrap:wrap">
    ${sigueInfo}
    <button class="mark-btn" data-vstart="${esc(e.direccion)}">Marcar renovado</button>
    <button class="mark-btn" data-nr-start="${esc(e.direccion)}" style="font-size:11px;border-color:rgba(var(--red-rgb),0.35);color:var(--red)">&#10005; No renueva</button>
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
  const bcolor      = activeMk ? 'var(--green)' : nrMkC ? 'rgba(150,150,150,0.3)' : color;
  const inicioLabel = `Inicio original: ${fmtDate(e.fechaInicio)}`;
  const overdueTag  = overdue
    ? `<span style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:color-mix(in srgb, var(--red) 75%, var(--text));background:rgba(var(--red-rgb),0.12);border:1px solid rgba(var(--red-rgb),0.3);border-radius:3px;padding:1px 6px;margin-left:6px;vertical-align:middle">VENCIDO ${monthsAgo(vd)}</span>`
    : '';
  return `
    <div class="card" style="border-left:3px solid ${bcolor}${nrMkC ? ';filter:grayscale(1)' : ''}">
      <div class="card-top">
        <span style="color:${bcolor};font-weight:600">${esc(e.direccion)}${overdueTag}</span>
        <span class="badge" style="background:color-mix(in srgb, ${color} 13%, transparent);color:color-mix(in srgb, ${color} 75%, var(--text))">Vence ${fmtDate(vd)}${diasFaltan(vd)}</span>
      </div>
      ${datosPersonas(e)}
      <div class="card-meta">${inicioLabel} &middot; Contrato: ${esc(e.contratoStr||'-')} &middot; Alquiler: ${fmtMoney(e.importe, e.moneda)}</div>
      ${fmtNotas(e)}
      <div style="padding:4px 0 2px">
        <button class="mark-btn" data-copy-venc-msg="${esc(vencRenewalMsg(e))}" style="font-size:11px">&#128203; Copiar aviso de renovaci&oacute;n</button>
      </div>
      ${footerVenc(e)}
    </div>`;
}

// Helper para leer los inputs de fecha/plazo del footer de vencimiento
export function _readVencInputs(defaultYears) {
  const inp     = document.getElementById('inp-venc-date');
  const yearsEl = document.getElementById('inp-venc-years');
  const descEl  = document.getElementById('inp-venc-desc');
  const dateV   = inp ? inp.value : '';
  const d       = dateV ? parseISO(dateV) : null;
  const years   = yearsEl ? +yearsEl.value : defaultYears;
  const desc    = descEl ? descEl.value.trim() : '';
  return { d, years, desc };
}

// Renovaciones del mes elegido (ventana de 45 dias) que faltan resolver (el circulito de la pestaña).
export function contarPendientesRenovaciones() {
  return getVencimientos(estado.entries, estado.selMonth, estado.selYear).filter(e => !isVencResuelto(e)).length;
}

// Vencidos sin resolver, el mes elegido y el siguiente, con el filtro de resueltos.
export function renderRenovaciones(content) {
  const { m: nxM, y: nxY } = mesSiguiente(estado.selMonth, estado.selYear);
  const vencimientos  = getVencimientos(estado.entries, estado.selMonth, estado.selYear);
  // "Proximo" solo con los que no aparecen ya en el mes elegido (la ventana de 45 dias se superpone).
  const vencIds       = new Set(vencimientos.map(e => e.id));
  const vencProx      = getVencimientos(estado.entries, nxM, nxY).filter(e => !vencIds.has(e.id));
  const vencAtrasados = getVencidosAtrasados(estado.entries, estado.selMonth, estado.selYear);
  const filtro = filtroResueltos();
  const showPend = filtro.pendientes, showResv = filtro.resueltos;
  const vencPend = vencimientos.filter(e => !isVencResuelto(e));
  const vencResv = vencimientos.filter(e =>  isVencResuelto(e));
  const proxPend = vencProx.filter(e => !isVencResuelto(e));
  const proxResv = vencProx.filter(e =>  isVencResuelto(e));

  let h = '';
  if (showPend && vencAtrasados.length > 0) {
    h += `<div class="sec-title" style="color:var(--red)">&#9888; Vencidos sin resolver (${vencAtrasados.length})</div>`;
    h += `<div class="card-list">${vencAtrasados.map(e=>cardVenc(e,'var(--red)',true)).join('')}</div>`;
  }
  h += `<div class="sec-title${(showPend && vencAtrasados.length) ? ' sep' : ''}">${MONTH_NAMES[estado.selMonth]} ${estado.selYear}</div>`;
  const visibleVenc = (showPend ? vencPend : []).concat(showResv ? vencResv : []);
  if (visibleVenc.length === 0) {
    h += `<div class="empty">Sin renovaciones ${filtro.palabra} este mes</div>`;
  } else {
    if (showPend && vencPend.length) h += `<div class="card-list">${vencPend.map(e=>cardVenc(e)).join('')}</div>`;
    if (showResv && vencResv.length) h += `<div class="card-list">${vencResv.map(e=>cardVencCompact(e)).join('')}</div>`;
  }
  const visibleProx = (showPend ? proxPend : []).concat(showResv ? proxResv : []);
  h += `<div class="sec-title sep">Proximo: ${MONTH_NAMES[nxM]} ${nxY} (${visibleProx.length})</div>`;
  if (visibleProx.length === 0) {
    h += `<div class="empty">Sin renovaciones ${filtro.palabra} el mes que viene</div>`;
  } else {
    if (showPend && proxPend.length) h += `<div class="card-list">${proxPend.map(e=>cardVenc(e)).join('')}</div>`;
    if (showResv && proxResv.length) h += `<div class="card-list">${proxResv.map(e=>cardVencCompact(e)).join('')}</div>`;
  }
  content.innerHTML = h;
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.getElementById('content').addEventListener('click', async e => {
    // ── nr-start (iniciar "no renueva") ──────────────────────────────────────
    const nrStart = e.target.closest('[data-nr-start]');
    if (nrStart) {
      pendientes.noRenueva = nrStart.dataset.nrStart;
      pendientes.venc  = null;
      pendientes.noAumenta = null;
      render();
      setTimeout(() => { const el = document.getElementById('inp-nr-desc'); if (el) el.focus(); }, 50);
      return;
    }
    if (e.target.closest('[data-nr-cancel]')) { pendientes.noRenueva = null; render(); return; }

    // ── nr-conf (confirmar no renueva) ────────────────────────────────────────
    const nrConf = e.target.closest('[data-nr-conf]');
    if (nrConf) {
      const dir    = nrConf.dataset.nrConf;
      const descEl = document.getElementById('inp-nr-desc');
      const desc   = descEl ? descEl.value.trim() : '';
      const sigue  = !!(document.getElementById('inp-nr-sigue') || {}).checked;
      const entry  = entryByDir(dir);
      const vd     = entry ? getVencDate(entry) : null;
      estado.marks[`nr|${dir}`] = { date: fmtDate(new Date()), desc, sigueActivo: sigue, hasta: vd ? D.toISODate(vd) : '' };
      await saveMarks();
      pendientes.noRenueva = null;
      if (entry && desc) await saveNotes(entry, appendNote(entry, `NO RENUEVA${sigue ? ' (sigue en el apto)' : ''}: ${desc}`));
      if (entry && !sigue) {
        try { replaceEntry(await call('inactivate', entry.id)); showToast('No renueva: el alquiler pasó a inactivo (Ctrl+Z para deshacer)', 'info'); }
        catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
      }
      render();
      return;
    }

    // ── un-nr (deshacer no renueva) ───────────────────────────────────────────
    const unNr = e.target.closest('[data-un-nr]');
    if (unNr) { delete estado.marks[`nr|${unNr.dataset.unNr}`]; saveMarks(); render(); return; }

    // ── copiar aviso de renovacion ───────────────────────────────────────────
    const copyVenc = e.target.closest('[data-copy-venc-msg]');
    if (copyVenc) {
      copyToClipboard(copyVenc.dataset.copyVencMsg);
      const orig = copyVenc.innerHTML;
      copyVenc.innerHTML = '&#10003; Copiado';
      copyVenc.style.color = 'var(--green)';
      setTimeout(() => { copyVenc.innerHTML = orig; copyVenc.style.color = ''; }, 1800);
      return;
    }

    // ── un-ren / un-ren-r (deshacer renovacion desde card compacto) ──────────
    const unRen = e.target.closest('[data-un-ren]');
    if (unRen) { delete estado.marks[`v|${unRen.dataset.unRen}`]; saveMarks(); render(); return; }
    const unRenR = e.target.closest('[data-un-ren-r]');
    if (unRenR) { delete estado.marks[`vr|${unRenR.dataset.unRenR}`]; saveMarks(); render(); return; }

    // ── vstart / vstart-r ───────────────────────────────────────────────────────
    const vstart = e.target.closest('[data-vstart]');
    if (vstart) { pendientes.noRenueva = null; pendientes.noAumenta = null; pendientes.venc = vstart.dataset.vstart; render(); return; }

    const vstartR = e.target.closest('[data-vstart-r]');
    if (vstartR) { pendientes.noRenueva = null; pendientes.noAumenta = null; pendientes.venc = 'R:' + vstartR.dataset.vstartR; render(); return; }

    if (e.target.closest('[data-vcancel]')) { pendientes.venc = null; render(); return; }

    // ── vconf (ciclo original) ─────────────────────────────────────────────────
    const vconf = e.target.closest('[data-vconf]');
    if (vconf) {
      const dir    = vconf.dataset.vconf;
      const entry  = entryByDir(dir);
      const defY   = entry ? (realDuration(entry.contratoDuracion) || 2) : 2;
      const { d, years, desc } = _readVencInputs(defY);
      delete estado.marks[`nr|${dir}`];   // si no habia renovado pero seguia, ahora renovo
      estado.marks[`v|${dir}`] = { date: fmtDate(new Date()), nuevaInicio: d ? fmtDate(d) : '', renewYears: years };
      saveMarks();
      pendientes.venc  = null;
      if (entry) await saveRenewal(entry, years, desc);
      render();
      return;
    }

    // ── vconf-r (ciclo post-renovacion) ───────────────────────────────────────
    const vconfR = e.target.closest('[data-vconf-r]');
    if (vconfR) {
      const dir    = vconfR.dataset.vconfR;
      const entry  = entryByDir(dir);
      const mkPrev = estado.marks[vncKey({ direccion: dir })];
      const defY   = mkPrev ? (mkPrev.renewYears || 2) : 2;
      const { d, years, desc } = _readVencInputs(defY);
      delete estado.marks[`nr|${dir}`];
      estado.marks[`vr|${dir}`] = { date: fmtDate(new Date()), nuevaInicio: d ? fmtDate(d) : '', renewYears: years };
      saveMarks();
      pendientes.venc  = null;
      if (entry) await saveRenewal(entry, years, desc);
      render();
      return;
    }

    // ── vunc (desmarcar ciclo original) ──────────────────────────────────────
    const vunc = e.target.closest('[data-vunc]');
    if (vunc) {
      delete estado.marks[`v|${vunc.dataset.vunc}`];
      delete estado.marks[`vr|${vunc.dataset.vunc}`]; // tambien limpia el ciclo R si lo habia
      saveMarks(); render(); return;
    }

    // ── vunc-r (desmarcar solo ciclo post-renovacion) ─────────────────────────
    const vuncR = e.target.closest('[data-vunc-r]');
    if (vuncR) { delete estado.marks[`vr|${vuncR.dataset.vuncR}`]; saveMarks(); render(); return; }
  });
}
