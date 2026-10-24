// Pestaña Propietarios: tabla, detalle, ficha, documentos, unificar.
import { nuevosPrimero, puntoNuevo } from '../componentes/novedades.js';
import { Separadores, normalizar } from '../../../dominios/index.js';
import { dibujar } from '../app.js';
import { armarChips } from '../componentes/vinetas.js';
import { call } from '../nucleo/api.js';
import { esc, mostrarAviso } from '../nucleo/dom.js';
import { aplicarPropietarios, estado } from '../nucleo/estado.js';
import { formatearMails, enlaceTelefono } from '../nucleo/formato.js';
import { cerrarModal, abrirModal } from '../nucleo/modales.js';

// Usa el estado global de app.js (entries, owners, contacts, contractOwners, ownerDocs,
// ownerAccounts) y sus helpers (call, esc, normalizar, enlaceTelefono, mostrarAviso, dibujar, aplicarPropietarios).
let busquedaPropietarios     = '';

let propietariosSoloActivos = false;

const propietariosAbiertos = new Set();

const miniaturasDocs      = new Map();   // id de documento -> dataURL (cache)

let idPropietarioEditando = null;

let idUnificarConservar = null;

let idUnificarQuitar = null;

const contactoPorId = id => estado.contactos.find(c => c.id === id);

function insigniaContacto(c) {
  if (!c) return '';
  return `<span class="contact-tag" title="${esc([c.rol, c.telefono, c.mail].filter(Boolean).join(' · '))}">${esc(c.rol || 'Contacto')}: ${esc(c.nombre)}</span>`;
}

// Fila "Contacto:" para tarjetas y detalle de la Base de Datos.
export function filaContacto(e, cls) {
  if (!e.contactos || !e.contactos.length) return '';
  return e.contactos.map(c => `<div class="${cls}"><span class="lbl">Contacto: </span>${esc(c.nombre)}${
    c.rol ? ` <span class="contact-tag">${esc(c.rol)}</span>` : ''} ${c.telefono ? enlaceTelefono(c.telefono) : ''}</div>`).join('');
}

export function contratosPorPropietario() {
  const mapa = new Map();
  for (const e of estado.entradas || []) for (const o of e.propietarios || []) {
    if (!mapa.has(o.id)) mapa.set(o.id, []);
    mapa.get(o.id).push(e);
  }
  return mapa;
}

// Aptos distintos de un propietario (un apto puede tener varios contratos en el tiempo).
function unidadesPropietario(aptos) {
  const m = new Map();
  for (const e of aptos) {
    const u = m.get(e.direccion) || { direccion: e.direccion, activo: false, ids: [] };
    u.activo = u.activo || !e.inactivo; u.ids.push(e.id);
    m.set(e.direccion, u);
  }
  return [...m.values()].sort((a, b) => (b.activo - a.activo) || a.direccion.localeCompare(b.direccion, 'es'));
}

function datosFaltantesContrato(o) {
  const faltan = [];
  if (!o.cedula) faltan.push('cedula');
  if (!estado.docsPropietarios.some(d => d.idPropietario === o.id)) faltan.push('foto de cedula');
  if (!o.domicilio) faltan.push('domicilio');
  if (!o.estadoCivil) faltan.push('estado civil');
  if (!o.cuentaCobro && !estado.cuentasPropietarios.some(a => a.idPropietario === o.id)) faltan.push('cuenta de cobro');
  return faltan;
}

export function dibujarPanelPropietarios() {
  const porPropietario = contratosPorPropietario();
  const q = normalizar(busquedaPropietarios.trim());
  const qDigits = q.replace(/\D/g, '');
  const lista = estado.propietarios.filter(o => {
    const aptos = porPropietario.get(o.id) || [];
    if (propietariosSoloActivos && !aptos.some(e => !e.inactivo)) return false;
    if (!q) return true;
    const c = o.idContacto ? contactoPorId(o.idContacto) : null;
    const hay = [o.nombre, o.telefono, o.mail, o.cedula, o.domicilio, o.notas, c && c.nombre, ...aptos.map(e => e.direccion)].map(normalizar).join(' ');
    return hay.includes(q) || (qDigits.length >= 4 && [o.telefono, o.cedula].some(v => (v || '').replace(/\D/g, '').includes(qDigits)));
  });
  document.getElementById('owners-count').textContent = `${lista.length} / ${estado.propietarios.length} propietarios`;
  const tbody = document.getElementById('owners-tbody');
  if (!lista.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty">Sin propietarios que coincidan.</td></tr>`; return; }

  tbody.innerHTML = nuevosPrimero('propietarios', lista).map(o => {
    const aptos = porPropietario.get(o.id) || [];
    const unidades = unidadesPropietario(aptos);
    const act = unidades.filter(u => u.activo).length;
    const c = o.idContacto ? contactoPorId(o.idContacto) : null;
    const exp = propietariosAbiertos.has(o.id);
    return `<tr class="db-row${exp ? ' expanded' : ''}" data-owner-row="${o.id}">
        <td><span class="db-dir">${esc(o.nombre)}</span> ${insigniaContacto(c)}</td>
        <td>${enlaceTelefono(o.telefono)}</td>
        <td>${formatearMails(o.mail)}</td>
        <td style="white-space:nowrap">${unidades.length}${unidades.length ? ` <span style="color:var(--dim);font-size:11px">(${act} activo${act === 1 ? '' : 's'})</span>` : ''}</td>
        <td class="db-chevron">${puntoNuevo('propietarios', o.id)}&#9658;</td>
      </tr>
      <tr class="db-detail-row" style="${exp ? '' : 'display:none'}">
        <td colspan="5">${exp ? detallePropietario(o, unidades, c) : ''}</td>
      </tr>`;
  }).join('');
  lista.filter(o => propietariosAbiertos.has(o.id)).forEach(cargarMiniaturasDocs);
}

function detallePropietario(o, unidades, c) {
  const faltan = datosFaltantesContrato(o);
  const documentos = estado.docsPropietarios.filter(d => d.idPropietario === o.id);
  const cuenta = d => (estado.cuentasPropietarios.find(a => a.idPropietario === o.id && a.direccion === d) || {}).cuenta || '';
  return `<div class="db-detail-inner">
    <div class="db-detail-grid">
      <div><span class="lbl">Cedula: </span>${o.cedula ? esc(o.cedula) : '<span class="missing">falta</span>'}</div>
      <div><span class="lbl">Estado civil: </span>${o.estadoCivil ? esc(o.estadoCivil) : '<span class="missing">falta</span>'}</div>
      <div class="dfull"><span class="lbl">Domicilio: </span>${o.domicilio ? esc(o.domicilio) : '<span class="missing">falta</span>'}</div>
      <div><span class="lbl">Celular: </span>${enlaceTelefono(o.telefono)}</div>
      <div><span class="lbl">Mail: </span>${formatearMails(o.mail)}</div>
      ${c ? `<div class="dfull"><span class="lbl">Contacto: </span>${esc(c.nombre)} <span class="contact-tag">${esc(c.rol || 'Contacto')}</span> ${enlaceTelefono(c.telefono)}${c.mail ? ' ' + formatearMails(c.mail) : ''}</div>` : ''}
    </div>
    ${faltan.length ? `<div class="missing" style="margin-top:8px">Falta para contratos: ${faltan.join(', ')}</div>` : ''}

    <div class="owner-section">
      <div class="owner-section-title">Foto de cedula</div>
      <div class="owner-docs">
        ${documentos.map(d => `<div class="owner-doc" data-doc-view="${d.id}" data-doc-thumb="${d.id}" title="${esc(d.nombreOriginal)}">
            ${/\.pdf$/i.test(d.archivo) ? 'PDF' : ''}<button class="doc-del" data-doc-del="${d.id}" title="Quitar">&times;</button></div>`).join('')}
        <button class="mark-btn" data-doc-add="${o.id}">&#65291; Agregar foto</button>
      </div>
    </div>

    <div class="owner-section">
      <div class="owner-section-title">Aptos y cuenta de cobro ${o.cuentaCobro ? `<span class="field-hint">(general: ${esc(o.cuentaCobro)})</span>` : ''}</div>
      ${unidades.length ? unidades.map(u => `<div class="acct-row">
          <span class="owner-apt${u.activo ? '' : ' inactive'} acct-dir" data-goto-contract="${u.ids[u.ids.length - 1]}" style="cursor:pointer" title="Ver en Base de Datos">${esc(u.direccion)}</span>
          <input type="text" data-acct-owner="${o.id}" data-acct-dir="${esc(u.direccion)}" value="${esc(cuenta(u.direccion))}"
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

async function cargarMiniaturasDocs(o) {
  for (const d of estado.docsPropietarios.filter(x => x.idPropietario === o.id)) {
    const el = document.querySelector(`[data-doc-thumb="${d.id}"]`);
    if (!el || /\.pdf$/i.test(d.archivo)) continue;
    if (!miniaturasDocs.has(d.id)) {
      try { const r = await call('vistaPreviaDoc', d.id); miniaturasDocs.set(d.id, r.image ? r.urlDatos : null); }
      catch (_) { miniaturasDocs.set(d.id, null); }
    }
    const url = miniaturasDocs.get(d.id);
    if (url) el.style.backgroundImage = `url("${url}")`; else el.firstChild.textContent = '?';
  }
}

export const val = id => document.getElementById(id).value.trim();

const ponerValor = (id, v) => { document.getElementById(id).value = v || ''; };

function completarCamposContacto() {
  const sel = document.getElementById('m-own-contact').value;
  const mostrar = sel !== '';
  document.querySelectorAll('[data-contact-field]').forEach(el => { el.hidden = !mostrar; });
  if (sel === 'new') { ['m-con-nombre', 'm-con-rol', 'm-con-tel', 'm-con-mail'].forEach(i => ponerValor(i, '')); document.getElementById('m-con-shared').textContent = ''; return; }
  const c = sel ? contactoPorId(+sel) : null;
  if (!c) return;
  ponerValor('m-con-nombre', c.nombre); ponerValor('m-con-rol', c.rol); ponerValor('m-con-tel', c.telefono); ponerValor('m-con-mail', c.mail);
  const n = estado.propietarios.filter(o => o.idContacto === c.id && o.id !== idPropietarioEditando).length;
  document.getElementById('m-con-shared').textContent = n ? `Este contacto tambien figura en ${n} propietario(s): los cambios se aplican a todos.` : '';
}

// Contacto y notas: linea que se despliega; abierta solo si ya tiene datos.
function ponerOpcionPropia(contacto, notas) {
  document.getElementById('own-opt-contacto').open = contacto;
  document.getElementById('own-opt-notas').open = notas;
}

function mostrarModalPropietario(o) {
  idPropietarioEditando = o ? o.id : null;
  document.getElementById('modal-owner-title').textContent = o ? 'Ficha del Propietario' : 'Nuevo Propietario';
  ponerValor('m-own-nombre', o && o.nombre); ponerValor('m-own-cedula', o && o.cedula); ponerValor('m-own-estado', o && o.estadoCivil);
  ponerValor('m-own-domicilio', o && o.domicilio); ponerValor('m-own-tel', o && o.telefono); ponerValor('m-own-mail', o && o.mail);
  ponerValor('m-own-cuenta', o && o.cuentaCobro); ponerValor('m-own-notas', o && o.notas);
  const sel = document.getElementById('m-own-contact');
  sel.innerHTML = `<option value="">Se habla directamente con el propietario</option>` +
    estado.contactos.map(c => `<option value="${c.id}">${esc(c.nombre)}${c.rol ? ' (' + esc(c.rol) + ')' : ''}</option>`).join('') +
    `<option value="new">&#65291; Nuevo contacto...</option>`;
  sel.value = o && o.idContacto ? String(o.idContacto) : '';
  completarCamposContacto();
  // Contacto y notas plegados salvo que ya tengan datos (se abren con su viñeta +).
  ponerOpcionPropia(!!(o && o.idContacto), !!(o && o.notas));
  abrirModal('modal-owner');
  setTimeout(() => document.getElementById('m-own-nombre').focus(), 60);
}

async function enviarPropietario() {
  const sel = document.getElementById('m-own-contact').value;
  const carga = {
    id: idPropietarioEditando, nombre: val('m-own-nombre'), cedula: val('m-own-cedula'), estadoCivil: val('m-own-estado'),
    domicilio: val('m-own-domicilio'), telefono: val('m-own-tel'), mail: val('m-own-mail'),
    cuentaCobro: val('m-own-cuenta'), notas: val('m-own-notas'),
    contacto: sel === '' ? { modo: 'none' } : {
      modo: sel === 'new' ? 'new' : 'existing', id: sel === 'new' ? null : +sel,
      nombre: val('m-con-nombre'), rol: val('m-con-rol'), telefono: val('m-con-tel'), mail: val('m-con-mail'),
      notas: sel === 'new' ? '' : (contactoPorId(+sel) || {}).notas,
    },
  };
  if (!carga.nombre) { mostrarAviso('El nombre es obligatorio.', 'err'); return; }
  if (carga.contacto.modo !== 'none' && !carga.contacto.nombre) { mostrarAviso('Falta el nombre del contacto.', 'err'); return; }
  try {
    aplicarPropietarios(await call('guardarPropietario', carga));
    cerrarModal('modal-owner');
    mostrarAviso('&#10003; Propietario guardado', 'ok');
    dibujar();
  } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
}

function mostrarModalUnificar(idConservar) {
  idUnificarConservar = idConservar; idUnificarQuitar = null;
  document.getElementById('merge-keep-name').textContent = estado.propietarios.find(o => o.id === idConservar).nombre;
  ponerValor('m-merge-search', '');
  document.getElementById('modal-merge-submit').disabled = true;
  dibujarResultadosUnificar();
  abrirModal('modal-merge');
  setTimeout(() => document.getElementById('m-merge-search').focus(), 60);
}

function dibujarResultadosUnificar() {
  const q = normalizar(val('m-merge-search'));
  const porPropietario = contratosPorPropietario();
  const lista = estado.propietarios.filter(o => o.id !== idUnificarConservar && (!q || normalizar(o.nombre).includes(q))).slice(0, 40);
  document.getElementById('merge-results').innerHTML = lista.map(o =>
    `<div class="merge-item${o.id === idUnificarQuitar ? ' selected' : ''}" data-merge-pick="${o.id}">${esc(o.nombre)}<small>${esc(o.telefono || '')} &middot; ${unidadesPropietario(porPropietario.get(o.id) || []).length} aptos</small></div>`
  ).join('') || '<div class="merge-item" style="color:var(--dim);cursor:default">Sin resultados</div>';
}

async function enviarUnificar() {
  const quitar = estado.propietarios.find(o => o.id === idUnificarQuitar), conservar = estado.propietarios.find(o => o.id === idUnificarConservar);
  if (!quitar || !conservar) return;
  if (!confirm(`Unificar "${quitar.nombre}" dentro de "${conservar.nombre}"?\n\nLos aptos y datos de "${quitar.nombre}" pasan a "${conservar.nombre}". Se puede deshacer con Ctrl+Z.`)) return;
  try {
    aplicarPropietarios(await call('unificarPropietarios', idUnificarConservar, idUnificarQuitar));
    cerrarModal('modal-merge');
    mostrarAviso('&#10003; Propietarios unificados (Ctrl+Z para deshacer)', 'ok');
    dibujar();
  } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
}

export async function borrarPropietario(id) {
  const o = estado.propietarios.find(x => x.id === id);
  const n = unidadesPropietario(contratosPorPropietario().get(id) || []).length;
  if (!confirm(`Eliminar el propietario "${o.nombre}"?${n ? `\n\n${n} apto(s) quedaran sin este propietario vinculado.` : ''}`)) return;
  try { aplicarPropietarios(await call('borrarPropietario', id)); propietariosAbiertos.delete(id); dibujar(); }
  catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
}

// Desde un apto: ir a la Base de Datos con ese contrato abierto (sin cambiar el filtro
// salvo que el contrato este inactivo).
function irAContrato(id) {
  const e = estado.entradas.find(x => x.id === id);
  if (!e) return;
  estado.pestanaActiva = 'basedatos';
  estado.baseTextoBusqueda = e.direccion;
  if (e.inactivo && estado.baseMostrarActivos) {
    estado.baseMostrarActivos = false; estado.baseMostrarInactivos = false;
    document.getElementById('db-show-active').checked = false;
    document.getElementById('db-show-inactive').checked = false;
  }
  const inp = document.getElementById('db-search');
  inp.value = e.direccion;
  inp.closest('.search-wrap').classList.add('has-text');
  estado.filasAbiertas.add(id);
  dibujar();
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.getElementById('owners-search').addEventListener('input', e => {
    busquedaPropietarios = e.target.value;
    e.target.closest('.search-wrap').classList.toggle('has-text', !!e.target.value);
    dibujarPanelPropietarios();
  });

  document.getElementById('owners-search-clear').addEventListener('click', () => {
    const inp = document.getElementById('owners-search');
    inp.value = ''; busquedaPropietarios = '';
    inp.closest('.search-wrap').classList.remove('has-text');
    inp.focus(); dibujarPanelPropietarios();
  });

  document.getElementById('owners-only-active').addEventListener('change', e => { propietariosSoloActivos = e.target.checked; dibujarPanelPropietarios(); });

  document.getElementById('btn-add-owner').addEventListener('click', () => mostrarModalPropietario(null));

  document.getElementById('m-own-contact').addEventListener('change', completarCamposContacto);

  document.getElementById('owners-tbody').addEventListener('click', async e => {
    const t = e.target;
    const del = t.closest('[data-doc-del]');
    if (del) {
      e.stopPropagation();
      if (!confirm('Quitar este documento?')) return;
      try { aplicarPropietarios(await call('borrarDocPropietario', +del.dataset.docDel)); dibujar(); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
      return;
    }
    const vista = t.closest('[data-doc-view]');
    if (vista) {
      const id = +vista.dataset.docView, d = estado.docsPropietarios.find(x => x.id === id);
      if (d && /\.pdf$/i.test(d.archivo)) { call('abrirDoc', id).catch(err => mostrarAviso('Error: ' + esc(err.message), 'err')); return; }
      const url = miniaturasDocs.get(id);
      if (url) {
        document.getElementById('modal-doc-title').textContent = d ? d.nombreOriginal : 'Documento';
        document.getElementById('modal-doc-img').src = url;
        abrirModal('modal-doc');
      }
      return;
    }
    const agregar = t.closest('[data-doc-add]');
    if (agregar) {
      try { aplicarPropietarios(await call('agregarDocsPropietario', +agregar.dataset.docAdd)); dibujar(); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
      return;
    }
    if (t.closest('input')) return;
    const ir = t.closest('[data-goto-contract]');
    if (ir) return irAContrato(+ir.dataset.gotoContract);
    const ed = t.closest('[data-owner-edit]');
    if (ed) return mostrarModalPropietario(estado.propietarios.find(o => o.id === +ed.dataset.ownerEdit));
    const mg = t.closest('[data-owner-merge]');
    if (mg) return mostrarModalUnificar(+mg.dataset.ownerMerge);
    const dl = t.closest('[data-owner-del]');
    if (dl) return borrarPropietario(+dl.dataset.ownerDel);
    const fila = t.closest('[data-owner-row]');
    if (!fila) return;
    const id = +fila.dataset.ownerRow;
    if (propietariosAbiertos.has(id)) propietariosAbiertos.delete(id); else propietariosAbiertos.add(id);
    dibujarPanelPropietarios();
  });

  // Cuenta de cobro por apto: se guarda al salir del campo.
  document.getElementById('owners-tbody').addEventListener('change', async e => {
    const inp = e.target.closest('[data-acct-owner]');
    if (!inp) return;
    try {
      aplicarPropietarios(await call('ponerCuentaPropietario', +inp.dataset.acctOwner, inp.dataset.acctDir, inp.value.trim()));
      mostrarAviso('&#10003; Cuenta de cobro guardada', 'ok');
    } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
  });

  document.getElementById('modal-owner-submit').addEventListener('click', enviarPropietario);

  document.getElementById('modal-merge-submit').addEventListener('click', enviarUnificar);

  document.getElementById('m-merge-search').addEventListener('input', dibujarResultadosUnificar);

  document.getElementById('merge-results').addEventListener('click', e => {
    const it = e.target.closest('[data-merge-pick]');
    if (!it) return;
    idUnificarQuitar = +it.dataset.mergePick;
    document.getElementById('modal-merge-submit').disabled = false;
    dibujarResultadosUnificar();
  });

  // Celulares y mails de la ficha y del contacto, como viñetas.
  for (const [id, tipo, lbl, ph] of [['m-own-tel', 'telefonos', 'Celular', '09X XXX XXX'], ['m-own-mail', 'mails', 'Mail', 'mail@ejemplo.com'],
                                     ['m-con-tel', 'telefonos', 'Teléfono', '09X XXX XXX'], ['m-con-mail', 'mails', 'Mail', 'mail@ejemplo.com']]) {
    armarChips(id, { split: Separadores[tipo], join: a => a.join(' / '), placeholder: ph, etiquetaAgregar: lbl });
  }
}
