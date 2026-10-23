// Pestaña Propietarios: tabla, detalle, ficha, documentos, unificar.
import { nuevosPrimero, puntoNuevo } from '../componentes/novedades.js';
import { Separadores, normalizar } from '../../../dominios/index.js';
import { render } from '../app.js';
import { makeChips } from '../componentes/vinetas.js';
import { call } from '../nucleo/api.js';
import { esc, showToast } from '../nucleo/dom.js';
import { applyOwners, estado } from '../nucleo/estado.js';
import { fmtMails, telLink } from '../nucleo/formato.js';
import { closeModal, openModal } from '../nucleo/modales.js';

// Usa el estado global de app.js (entries, owners, contacts, contractOwners, ownerDocs,
// ownerAccounts) y sus helpers (call, esc, normalizar, telLink, showToast, render, applyOwners).
let ownersSearch     = '';

let ownersOnlyActive = false;

const ownersExpanded = new Set();

const docThumbs      = new Map();   // id de documento -> dataURL (cache)

let ownerEditId = null;

let mergeKeepId = null;

let mergeDropId = null;

const contactById = id => estado.contacts.find(c => c.id === id);

function contactBadge(c) {
  if (!c) return '';
  return `<span class="contact-tag" title="${esc([c.rol, c.telefono, c.mail].filter(Boolean).join(' · '))}">${esc(c.rol || 'Contacto')}: ${esc(c.nombre)}</span>`;
}

// Fila "Contacto:" para tarjetas y detalle de la Base de Datos.
export function contactRow(e, cls) {
  if (!e.contacts || !e.contacts.length) return '';
  return e.contacts.map(c => `<div class="${cls}"><span class="lbl">Contacto: </span>${esc(c.nombre)}${
    c.rol ? ` <span class="contact-tag">${esc(c.rol)}</span>` : ''} ${c.telefono ? telLink(c.telefono) : ''}</div>`).join('');
}

export function contractsByOwner() {
  const map = new Map();
  for (const e of estado.entries || []) for (const o of e.owners || []) {
    if (!map.has(o.id)) map.set(o.id, []);
    map.get(o.id).push(e);
  }
  return map;
}

// Aptos distintos de un propietario (un apto puede tener varios contratos en el tiempo).
function ownerUnits(apts) {
  const m = new Map();
  for (const e of apts) {
    const u = m.get(e.direccion) || { direccion: e.direccion, activo: false, ids: [] };
    u.activo = u.activo || !e.inactive; u.ids.push(e.id);
    m.set(e.direccion, u);
  }
  return [...m.values()].sort((a, b) => (b.activo - a.activo) || a.direccion.localeCompare(b.direccion, 'es'));
}

function missingContractData(o) {
  const faltan = [];
  if (!o.cedula) faltan.push('cedula');
  if (!estado.ownerDocs.some(d => d.ownerId === o.id)) faltan.push('foto de cedula');
  if (!o.domicilio) faltan.push('domicilio');
  if (!o.estadoCivil) faltan.push('estado civil');
  if (!o.cuentaCobro && !estado.ownerAccounts.some(a => a.ownerId === o.id)) faltan.push('cuenta de cobro');
  return faltan;
}

export function renderOwnersPanel() {
  const byOwner = contractsByOwner();
  const q = normalizar(ownersSearch.trim());
  const qDigits = q.replace(/\D/g, '');
  const list = estado.owners.filter(o => {
    const apts = byOwner.get(o.id) || [];
    if (ownersOnlyActive && !apts.some(e => !e.inactive)) return false;
    if (!q) return true;
    const c = o.contactId ? contactById(o.contactId) : null;
    const hay = [o.nombre, o.telefono, o.mail, o.cedula, o.domicilio, o.notas, c && c.nombre, ...apts.map(e => e.direccion)].map(normalizar).join(' ');
    return hay.includes(q) || (qDigits.length >= 4 && [o.telefono, o.cedula].some(v => (v || '').replace(/\D/g, '').includes(qDigits)));
  });
  document.getElementById('owners-count').textContent = `${list.length} / ${estado.owners.length} propietarios`;
  const tbody = document.getElementById('owners-tbody');
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty">Sin propietarios que coincidan.</td></tr>`; return; }

  tbody.innerHTML = nuevosPrimero('propietarios', list).map(o => {
    const apts = byOwner.get(o.id) || [];
    const units = ownerUnits(apts);
    const act = units.filter(u => u.activo).length;
    const c = o.contactId ? contactById(o.contactId) : null;
    const exp = ownersExpanded.has(o.id);
    return `<tr class="db-row${exp ? ' expanded' : ''}" data-owner-row="${o.id}">
        <td><span class="db-dir">${esc(o.nombre)}</span> ${contactBadge(c)}</td>
        <td>${telLink(o.telefono)}</td>
        <td>${fmtMails(o.mail)}</td>
        <td style="white-space:nowrap">${units.length}${units.length ? ` <span style="color:var(--dim);font-size:11px">(${act} activo${act === 1 ? '' : 's'})</span>` : ''}</td>
        <td class="db-chevron">${puntoNuevo('propietarios', o.id)}&#9658;</td>
      </tr>
      <tr class="db-detail-row" style="${exp ? '' : 'display:none'}">
        <td colspan="5">${exp ? ownerDetail(o, units, c) : ''}</td>
      </tr>`;
  }).join('');
  list.filter(o => ownersExpanded.has(o.id)).forEach(loadDocThumbs);
}

function ownerDetail(o, units, c) {
  const faltan = missingContractData(o);
  const docs = estado.ownerDocs.filter(d => d.ownerId === o.id);
  const acct = d => (estado.ownerAccounts.find(a => a.ownerId === o.id && a.direccion === d) || {}).cuenta || '';
  return `<div class="db-detail-inner">
    <div class="db-detail-grid">
      <div><span class="lbl">Cedula: </span>${o.cedula ? esc(o.cedula) : '<span class="missing">falta</span>'}</div>
      <div><span class="lbl">Estado civil: </span>${o.estadoCivil ? esc(o.estadoCivil) : '<span class="missing">falta</span>'}</div>
      <div class="dfull"><span class="lbl">Domicilio: </span>${o.domicilio ? esc(o.domicilio) : '<span class="missing">falta</span>'}</div>
      <div><span class="lbl">Celular: </span>${telLink(o.telefono)}</div>
      <div><span class="lbl">Mail: </span>${fmtMails(o.mail)}</div>
      ${c ? `<div class="dfull"><span class="lbl">Contacto: </span>${esc(c.nombre)} <span class="contact-tag">${esc(c.rol || 'Contacto')}</span> ${telLink(c.telefono)}${c.mail ? ' ' + fmtMails(c.mail) : ''}</div>` : ''}
    </div>
    ${faltan.length ? `<div class="missing" style="margin-top:8px">Falta para contratos: ${faltan.join(', ')}</div>` : ''}

    <div class="owner-section">
      <div class="owner-section-title">Foto de cedula</div>
      <div class="owner-docs">
        ${docs.map(d => `<div class="owner-doc" data-doc-view="${d.id}" data-doc-thumb="${d.id}" title="${esc(d.nombreOriginal)}">
            ${/\.pdf$/i.test(d.archivo) ? 'PDF' : ''}<button class="doc-del" data-doc-del="${d.id}" title="Quitar">&times;</button></div>`).join('')}
        <button class="mark-btn" data-doc-add="${o.id}">&#65291; Agregar foto</button>
      </div>
    </div>

    <div class="owner-section">
      <div class="owner-section-title">Aptos y cuenta de cobro ${o.cuentaCobro ? `<span class="field-hint">(general: ${esc(o.cuentaCobro)})</span>` : ''}</div>
      ${units.length ? units.map(u => `<div class="acct-row">
          <span class="owner-apt${u.activo ? '' : ' inactive'} acct-dir" data-goto-contract="${u.ids[u.ids.length - 1]}" style="cursor:pointer" title="Ver en Base de Datos">${esc(u.direccion)}</span>
          <input type="text" data-acct-owner="${o.id}" data-acct-dir="${esc(u.direccion)}" value="${esc(acct(u.direccion))}"
            placeholder="${o.cuentaCobro ? 'Usa la general' : 'Cuenta o metodo de cobro de este apto'}">
        </div>`).join('') : '<span style="color:var(--dim);font-size:11px">Sin aptos vinculados</span>'}
    </div>

    ${o.notas ? `<div class="owner-notes">${esc(o.notas)}</div>` : ''}
    <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(var(--fg),0.06);display:flex;gap:8px;flex-wrap:wrap">
      <button class="mark-btn" data-owner-edit="${o.id}">&#9998; Editar ficha</button>
      <button class="mark-btn" data-owner-merge="${o.id}">&#8644; Unificar con otro...</button>
      <button class="mark-btn" data-owner-del="${o.id}" style="margin-left:auto;color:rgba(var(--red-rgb),0.7);border-color:rgba(var(--red-rgb),0.25)">&times; Eliminar</button>
    </div>
  </div>`;
}

async function loadDocThumbs(o) {
  for (const d of estado.ownerDocs.filter(x => x.ownerId === o.id)) {
    const el = document.querySelector(`[data-doc-thumb="${d.id}"]`);
    if (!el || /\.pdf$/i.test(d.archivo)) continue;
    if (!docThumbs.has(d.id)) {
      try { const r = await call('vistaPreviaDoc', d.id); docThumbs.set(d.id, r.image ? r.dataUrl : null); }
      catch (_) { docThumbs.set(d.id, null); }
    }
    const url = docThumbs.get(d.id);
    if (url) el.style.backgroundImage = `url("${url}")`; else el.firstChild.textContent = '?';
  }
}

export const val = id => document.getElementById(id).value.trim();

const setVal = (id, v) => { document.getElementById(id).value = v || ''; };

function fillContactFields() {
  const sel = document.getElementById('m-own-contact').value;
  const show = sel !== '';
  document.querySelectorAll('[data-contact-field]').forEach(el => { el.hidden = !show; });
  if (sel === 'new') { ['m-con-nombre', 'm-con-rol', 'm-con-tel', 'm-con-mail'].forEach(i => setVal(i, '')); document.getElementById('m-con-shared').textContent = ''; return; }
  const c = sel ? contactById(+sel) : null;
  if (!c) return;
  setVal('m-con-nombre', c.nombre); setVal('m-con-rol', c.rol); setVal('m-con-tel', c.telefono); setVal('m-con-mail', c.mail);
  const n = estado.owners.filter(o => o.contactId === c.id && o.id !== ownerEditId).length;
  document.getElementById('m-con-shared').textContent = n ? `Este contacto tambien figura en ${n} propietario(s): los cambios se aplican a todos.` : '';
}

// Contacto y notas: linea que se despliega; abierta solo si ya tiene datos.
function setOwnOpt(contacto, notas) {
  document.getElementById('own-opt-contacto').open = contacto;
  document.getElementById('own-opt-notas').open = notas;
}

function showOwnerModal(o) {
  ownerEditId = o ? o.id : null;
  document.getElementById('modal-owner-title').textContent = o ? 'Ficha del Propietario' : 'Nuevo Propietario';
  setVal('m-own-nombre', o && o.nombre); setVal('m-own-cedula', o && o.cedula); setVal('m-own-estado', o && o.estadoCivil);
  setVal('m-own-domicilio', o && o.domicilio); setVal('m-own-tel', o && o.telefono); setVal('m-own-mail', o && o.mail);
  setVal('m-own-cuenta', o && o.cuentaCobro); setVal('m-own-notas', o && o.notas);
  const sel = document.getElementById('m-own-contact');
  sel.innerHTML = `<option value="">Se habla directamente con el propietario</option>` +
    estado.contacts.map(c => `<option value="${c.id}">${esc(c.nombre)}${c.rol ? ' (' + esc(c.rol) + ')' : ''}</option>`).join('') +
    `<option value="new">&#65291; Nuevo contacto...</option>`;
  sel.value = o && o.contactId ? String(o.contactId) : '';
  fillContactFields();
  // Contacto y notas plegados salvo que ya tengan datos (se abren con su viñeta +).
  setOwnOpt(!!(o && o.contactId), !!(o && o.notas));
  openModal('modal-owner');
  setTimeout(() => document.getElementById('m-own-nombre').focus(), 60);
}

async function submitOwner() {
  const sel = document.getElementById('m-own-contact').value;
  const payload = {
    id: ownerEditId, nombre: val('m-own-nombre'), cedula: val('m-own-cedula'), estadoCivil: val('m-own-estado'),
    domicilio: val('m-own-domicilio'), telefono: val('m-own-tel'), mail: val('m-own-mail'),
    cuentaCobro: val('m-own-cuenta'), notas: val('m-own-notas'),
    contact: sel === '' ? { mode: 'none' } : {
      mode: sel === 'new' ? 'new' : 'existing', id: sel === 'new' ? null : +sel,
      nombre: val('m-con-nombre'), rol: val('m-con-rol'), telefono: val('m-con-tel'), mail: val('m-con-mail'),
      notas: sel === 'new' ? '' : (contactById(+sel) || {}).notas,
    },
  };
  if (!payload.nombre) { showToast('El nombre es obligatorio.', 'err'); return; }
  if (payload.contact.mode !== 'none' && !payload.contact.nombre) { showToast('Falta el nombre del contacto.', 'err'); return; }
  try {
    applyOwners(await call('guardarPropietario', payload));
    closeModal('modal-owner');
    showToast('&#10003; Propietario guardado', 'ok');
    render();
  } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
}

function showMergeModal(keepId) {
  mergeKeepId = keepId; mergeDropId = null;
  document.getElementById('merge-keep-name').textContent = estado.owners.find(o => o.id === keepId).nombre;
  setVal('m-merge-search', '');
  document.getElementById('modal-merge-submit').disabled = true;
  renderMergeResults();
  openModal('modal-merge');
  setTimeout(() => document.getElementById('m-merge-search').focus(), 60);
}

function renderMergeResults() {
  const q = normalizar(val('m-merge-search'));
  const byOwner = contractsByOwner();
  const list = estado.owners.filter(o => o.id !== mergeKeepId && (!q || normalizar(o.nombre).includes(q))).slice(0, 40);
  document.getElementById('merge-results').innerHTML = list.map(o =>
    `<div class="merge-item${o.id === mergeDropId ? ' selected' : ''}" data-merge-pick="${o.id}">${esc(o.nombre)}<small>${esc(o.telefono || '')} &middot; ${ownerUnits(byOwner.get(o.id) || []).length} aptos</small></div>`
  ).join('') || '<div class="merge-item" style="color:var(--dim);cursor:default">Sin resultados</div>';
}

async function submitMerge() {
  const drop = estado.owners.find(o => o.id === mergeDropId), keep = estado.owners.find(o => o.id === mergeKeepId);
  if (!drop || !keep) return;
  if (!confirm(`Unificar "${drop.nombre}" dentro de "${keep.nombre}"?\n\nLos aptos y datos de "${drop.nombre}" pasan a "${keep.nombre}". Se puede deshacer con Ctrl+Z.`)) return;
  try {
    applyOwners(await call('unificarPropietarios', mergeKeepId, mergeDropId));
    closeModal('modal-merge');
    showToast('&#10003; Propietarios unificados (Ctrl+Z para deshacer)', 'ok');
    render();
  } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
}

export async function borrarPropietario(id) {
  const o = estado.owners.find(x => x.id === id);
  const n = ownerUnits(contractsByOwner().get(id) || []).length;
  if (!confirm(`Eliminar el propietario "${o.nombre}"?${n ? `\n\n${n} apto(s) quedaran sin este propietario vinculado.` : ''}`)) return;
  try { applyOwners(await call('borrarPropietario', id)); ownersExpanded.delete(id); render(); }
  catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
}

// Desde un apto: ir a la Base de Datos con ese contrato abierto (sin cambiar el filtro
// salvo que el contrato este inactivo).
function gotoContract(id) {
  const e = estado.entries.find(x => x.id === id);
  if (!e) return;
  estado.activeTab = 'basedatos';
  estado.dbSearchText = e.direccion;
  if (e.inactive && estado.dbShowActive) {
    estado.dbShowActive = false; estado.dbShowInactive = false;
    document.getElementById('db-show-active').checked = false;
    document.getElementById('db-show-inactive').checked = false;
  }
  const inp = document.getElementById('db-search');
  inp.value = e.direccion;
  inp.closest('.search-wrap').classList.add('has-text');
  estado.expandedRows.add(id);
  render();
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.getElementById('owners-search').addEventListener('input', e => {
    ownersSearch = e.target.value;
    e.target.closest('.search-wrap').classList.toggle('has-text', !!e.target.value);
    renderOwnersPanel();
  });

  document.getElementById('owners-search-clear').addEventListener('click', () => {
    const inp = document.getElementById('owners-search');
    inp.value = ''; ownersSearch = '';
    inp.closest('.search-wrap').classList.remove('has-text');
    inp.focus(); renderOwnersPanel();
  });

  document.getElementById('owners-only-active').addEventListener('change', e => { ownersOnlyActive = e.target.checked; renderOwnersPanel(); });

  document.getElementById('btn-add-owner').addEventListener('click', () => showOwnerModal(null));

  document.getElementById('m-own-contact').addEventListener('change', fillContactFields);

  document.getElementById('owners-tbody').addEventListener('click', async e => {
    const t = e.target;
    const del = t.closest('[data-doc-del]');
    if (del) {
      e.stopPropagation();
      if (!confirm('Quitar este documento?')) return;
      try { applyOwners(await call('borrarDocPropietario', +del.dataset.docDel)); render(); } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
      return;
    }
    const view = t.closest('[data-doc-view]');
    if (view) {
      const id = +view.dataset.docView, d = estado.ownerDocs.find(x => x.id === id);
      if (d && /\.pdf$/i.test(d.archivo)) { call('abrirDoc', id).catch(err => showToast('Error: ' + esc(err.message), 'err')); return; }
      const url = docThumbs.get(id);
      if (url) {
        document.getElementById('modal-doc-title').textContent = d ? d.nombreOriginal : 'Documento';
        document.getElementById('modal-doc-img').src = url;
        openModal('modal-doc');
      }
      return;
    }
    const add = t.closest('[data-doc-add]');
    if (add) {
      try { applyOwners(await call('agregarDocsPropietario', +add.dataset.docAdd)); render(); } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
      return;
    }
    if (t.closest('input')) return;
    const go = t.closest('[data-goto-contract]');
    if (go) return gotoContract(+go.dataset.gotoContract);
    const ed = t.closest('[data-owner-edit]');
    if (ed) return showOwnerModal(estado.owners.find(o => o.id === +ed.dataset.ownerEdit));
    const mg = t.closest('[data-owner-merge]');
    if (mg) return showMergeModal(+mg.dataset.ownerMerge);
    const dl = t.closest('[data-owner-del]');
    if (dl) return borrarPropietario(+dl.dataset.ownerDel);
    const row = t.closest('[data-owner-row]');
    if (!row) return;
    const id = +row.dataset.ownerRow;
    if (ownersExpanded.has(id)) ownersExpanded.delete(id); else ownersExpanded.add(id);
    renderOwnersPanel();
  });

  // Cuenta de cobro por apto: se guarda al salir del campo.
  document.getElementById('owners-tbody').addEventListener('change', async e => {
    const inp = e.target.closest('[data-acct-owner]');
    if (!inp) return;
    try {
      applyOwners(await call('ponerCuentaPropietario', +inp.dataset.acctOwner, inp.dataset.acctDir, inp.value.trim()));
      showToast('&#10003; Cuenta de cobro guardada', 'ok');
    } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
  });

  document.getElementById('modal-owner-submit').addEventListener('click', submitOwner);

  document.getElementById('modal-merge-submit').addEventListener('click', submitMerge);

  document.getElementById('m-merge-search').addEventListener('input', renderMergeResults);

  document.getElementById('merge-results').addEventListener('click', e => {
    const it = e.target.closest('[data-merge-pick]');
    if (!it) return;
    mergeDropId = +it.dataset.mergePick;
    document.getElementById('modal-merge-submit').disabled = false;
    renderMergeResults();
  });

  // Celulares y mails de la ficha y del contacto, como viñetas.
  for (const [id, kind, lbl, ph] of [['m-own-tel', 'telefonos', 'Celular', '09X XXX XXX'], ['m-own-mail', 'mails', 'Mail', 'mail@ejemplo.com'],
                                     ['m-con-tel', 'telefonos', 'Teléfono', '09X XXX XXX'], ['m-con-mail', 'mails', 'Mail', 'mail@ejemplo.com']]) {
    makeChips(id, { split: Separadores[kind], join: a => a.join(' / '), placeholder: ph, addLabel: lbl });
  }
}
