// Formulario de alquiler (alta / edicion): viñetas, garantia, moneda, campos plegables.
import * as D from '../../../dominios/index.js';
import { Splitters } from '../../../dominios/index.js';
import { render } from '../app.js';
import { _acIdx, _acItems, updateAddrPreview } from '../componentes/autocompletado.js';
import { makeChips, makePicker } from '../componentes/vinetas.js';
import { call } from '../nucleo/api.js';
import { esc, showToast } from '../nucleo/dom.js';
import { applyOwners, estado, replaceEntry } from '../nucleo/estado.js';
import { populateDBYears } from '../vistas/base-datos.js';
import { val } from '../vistas/propietarios.js';

// Base de datos
export let editingEntry    = null;   // entry que se esta editando (null = alta nueva)

export const chipFields = {};

// Moneda del alquiler (pesos / dolares)
export function setMoneda(v) {
  v = v === 'USD' ? 'USD' : 'UYU';
  document.getElementById('m-moneda').value = v;
  document.querySelectorAll('#m-moneda-seg [data-moneda]').forEach(b => b.classList.toggle('active', b.dataset.moneda === v));
}

// "Quien hace los aumentos" y "Comentarios" van plegados (linea que se despliega); se abren
// solos si ya tienen datos.
export function setOptFields(rem, notas) {
  document.getElementById('m-opt-rem').open = rem;
  document.getElementById('m-opt-notas').open = notas;
}

export function showAddModal() {
  editingEntry = null;
  ['m-edificio','m-calle','m-unidad','m-prop','m-inq','m-tel-prop','m-tel-inq','m-mail-prop','m-mail-inq','m-importe','m-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  setDuracionOption('');
  document.getElementById('m-fecha').value    = '';
  document.getElementById('m-remitente').value = '';
  setGarantiaOptions('');
  setMoneda('UYU');
  setOptFields(false, false);
  document.getElementById('modal-add-title').textContent = 'Nuevo Alquiler';
  const btn = document.getElementById('modal-submit');
  btn.disabled = false; btn.textContent = 'Guardar alquiler';
  updateAddrPreview();
  document.getElementById('modal-add').classList.add('open');
  setTimeout(() => document.getElementById('m-edificio').focus(), 80);
}

export function showEditModal(entry) {
  editingEntry = entry;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('m-edificio', entry.edificio);
  set('m-calle',    entry.calle || (entry.edificio ? '' : entry.direccion));
  set('m-unidad',   entry.unidad);
  set('m-prop',     entry.propietario);
  set('m-tel-prop', entry.telProp);
  set('m-mail-prop',entry.mailProp);
  set('m-inq',      entry.inquilino);
  set('m-tel-inq',  entry.telInq);
  set('m-mail-inq', entry.mailInq);
  set('m-importe',  entry.importe || '');
  set('m-notas',    entry.notas);
  setDuracionOption(entry.contratoStr || '');
  set('m-remitente', entry.remitente);
  setGarantiaOptions(entry.garantia);
  setMoneda(entry.moneda);
  setOptFields(!!entry.remitente, D.comentarios(entry).length > 0);
  document.getElementById('m-fecha').value = entry.fechaInicio
    ? entry.fechaInicio.getFullYear() + '-' +
      String(entry.fechaInicio.getMonth()+1).padStart(2,'0') + '-' +
      String(entry.fechaInicio.getDate()).padStart(2,'0')
    : '';
  document.getElementById('modal-add-title').textContent = 'Editar Alquiler';
  const btn = document.getElementById('modal-submit');
  btn.disabled = false; btn.textContent = 'Guardar cambios';
  updateAddrPreview();
  document.getElementById('modal-add').classList.add('open');
  setTimeout(() => document.getElementById('m-importe').focus(), 80);
}

// Duracion: viñetas fijas (1, 2, 3 años). Si el contrato tiene otra (o se agrega con "+"),
// queda como viñeta extra solo para ese contrato.
export function setDuracionOption(value) {
  const sel = document.getElementById('m-duracion');
  sel.querySelectorAll('option[data-custom]').forEach(o => o.remove());
  const same = [...sel.options].find(o => o.value && o.value.toLowerCase() === String(value || '').trim().toLowerCase());
  if (same) value = same.value;
  if (value && !same) {
    const o = document.createElement('option');
    o.value = value; o.textContent = value; o.dataset.custom = '1';
    sel.appendChild(o);
  }
  sel.value = value;
}

// Opciones = las de fabrica + las que se agregaron desde la app + las que ya usa algun contrato.
export function garantiaOptions() {
  let extra = [];
  try { extra = JSON.parse((estado.appSettings && estado.appSettings.garantias) || '[]'); } catch (_) {}
  const all = [...D.GARANTIAS_DEFAULT, ...extra, ...estado.entries.map(e => e.garantia)].filter(Boolean);
  const seen = new Set();
  return all.filter(g => { const k = g.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function setGarantiaOptions(value) {
  const sel = document.getElementById('m-garantia');
  const opts = garantiaOptions();
  const match = opts.find(g => g.toUpperCase() === String(value || '').toUpperCase());
  sel.innerHTML = `<option value="">Sin cargar</option>`
    + opts.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  sel.value = match || '';
  const dl = document.getElementById('dl-remitentes');
  const rems = [...new Set(estado.entries.map(e => e.remitente).filter(Boolean))].sort();
  dl.innerHTML = rems.map(r => `<option value="${esc(r)}">`).join('');
  updateGestionHint();
}

export function updateGestionHint() {
  const g = document.getElementById('m-garantia').value;
  const who = D.gestionadoPor({ garantia: g, remitente: document.getElementById('m-remitente').value.trim() });
  document.getElementById('m-gestion-hint').textContent = who
    ? `Los aumentos y renovaciones los gestiona ${who}: no aparece en Aumentos ni Renovaciones.`
    : 'Los aumentos los hace la inmobiliaria.';
}

// Garantia nueva (viñeta "+"): queda elegida y guardada como opcion para los proximos.
export function addGarantiaOption(name) {
  const exists = garantiaOptions().find(g => g.toUpperCase() === name.toUpperCase());
  if (!exists) {
    let extra = [];
    try { extra = JSON.parse((estado.appSettings && estado.appSettings.garantias) || '[]'); } catch (_) {}
    extra.push(name);
    estado.appSettings.garantias = JSON.stringify(extra);
    call('setSetting', 'garantias', estado.appSettings.garantias).catch(() => {});
  }
  setGarantiaOptions(exists || name);
}

export function hideAddModal() {
  document.getElementById('modal-add').classList.remove('open');
  editingEntry = null;
}

export async function deleteEntry(id, dir) {
  if (!confirm(`Marcar "${dir}" como INACTIVO?\n\nDejara de aparecer en aumentos y renovaciones.`)) return;
  try {
    replaceEntry(await call('inactivate', id));
    showToast('&#10003; Alquiler marcado como inactivo', 'ok');
    estado.expandedRows.delete(id);
    render();
  } catch (err) {
    showToast('Error: ' + esc(err.message), 'err');
  }
}

export async function submitAddEntry() {
  const edificio = document.getElementById('m-edificio').value.trim();
  const calle    = document.getElementById('m-calle').value.trim();
  const unidad   = document.getElementById('m-unidad').value.trim();
  const importe  = parseFloat(document.getElementById('m-importe').value);
  if (!edificio && !calle)      { showToast('Completá el edificio o la calle.', 'err'); return; }
  if (!importe || importe <= 0) { showToast('El importe es obligatorio.', 'err'); return; }

  const payload = {
    edificio, calle, unidad,
    propietario: (document.getElementById('m-prop').value     || '').trim(),
    telProp:     (document.getElementById('m-tel-prop').value || '').trim(),
    mailProp:    (document.getElementById('m-mail-prop').value|| '').trim(),
    inquilino:   (document.getElementById('m-inq').value      || '').trim(),
    telInq:      (document.getElementById('m-tel-inq').value  || '').trim(),
    mailInq:     (document.getElementById('m-mail-inq').value || '').trim(),
    importeBase: importe,
    contratoStr: document.getElementById('m-duracion').value  || '',
    fechaInicio: document.getElementById('m-fecha').value     || null,  // "YYYY-MM-DD"
    notas:       [...(editingEntry ? D.splitNotas(editingEntry.notas).filter(D.parseRenewalNote) : []),
                  ...D.splitNotas(document.getElementById('m-notas').value)].join(' | '),
    garantia:    document.getElementById('m-garantia').value,
    moneda:      document.getElementById('m-moneda').value,
    remitente:   document.getElementById('m-remitente').value.trim(),
  };

  const isEdit = editingEntry !== null;
  const btn = document.getElementById('modal-submit');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';
  try {
    const res = isEdit
      ? await call('updateContract', editingEntry.id, payload)
      : await call('addContract', payload);
    applyOwners(res);
    replaceEntry(res.contract);
    showToast(isEdit ? '&#10003; Alquiler actualizado' : '&#10003; Alquiler agregado correctamente', 'ok');
    hideAddModal();
    populateDBYears();
    render();
  } catch (err) {
    showToast('Error: ' + esc(err.message), 'err');
    btn.disabled    = false;
    btn.textContent = isEdit ? 'Guardar cambios' : 'Guardar alquiler';
  }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Vista previa del nombre del apto en el modal.
  ['m-edificio', 'm-calle', 'm-unidad'].forEach(id => document.getElementById(id).addEventListener('input', updateAddrPreview));

  // Modal agregar alquiler
  document.getElementById('btn-add-entry').addEventListener('click', showAddModal);
  document.getElementById('modal-close').addEventListener('click', hideAddModal);
  document.getElementById('modal-cancel').addEventListener('click', hideAddModal);
  document.getElementById('modal-submit').addEventListener('click', submitAddEntry);
  document.getElementById('m-garantia').addEventListener('change', updateGestionHint);
  document.getElementById('m-moneda-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-moneda]'); if (b) setMoneda(b.dataset.moneda);
  });
  // al desplegar, el cursor va al campo
  ['m-opt-rem', 'm-opt-notas'].forEach(id => document.getElementById(id).addEventListener('toggle', e => {
    if (e.target.open && document.getElementById('modal-add').classList.contains('open')) {
      const f = e.target.querySelector('input:not([type=hidden])'); if (f && !f.hidden) f.focus();
    }
  }));
  document.getElementById('m-remitente').addEventListener('input', updateGestionHint);

  // Campos con viñetas (deben existir antes del autocompletado)
  const S = Splitters, busy = () => _acIdx >= 0 && _acItems.length > 0;
  chipFields['m-adm-edificios'] = makeChips('m-adm-edificios', { split: S.edificios, join: a => a.join('; '), placeholder: 'Nombre del edificio + Enter', addLabel: 'Edificio' });
  chipFields['m-adm-telefono']  = makeChips('m-adm-telefono',  { split: S.telefonos, join: a => a.join('; '), placeholder: 'Teléfono + Enter', addLabel: 'Teléfono' });
  chipFields['m-adm-mail']      = makeChips('m-adm-mail',      { split: S.mails,     join: a => a.join('; '), placeholder: 'Mail + Enter', addLabel: 'Mail' });
  chipFields['m-prop'] = makeChips('m-prop', { split: S.personas, join: a => a.join(' / '), placeholder: 'Nombre completo', addLabel: 'Propietario', isBusy: busy });
  chipFields['m-inq']  = makeChips('m-inq',  { split: S.personas, join: a => a.join(' / '), placeholder: 'Nombre completo', addLabel: 'Inquilino', isBusy: busy });
  // Comentarios: las notas de renovacion no se muestran (se conservan al guardar, ver submitAddEntry).
  chipFields['m-notas'] = makeChips('m-notas', { split: s => D.comentarios({ notas: s }), join: a => a.join(' | '),
    placeholder: 'Observaciones, condiciones especiales... + Enter', addLabel: 'Comentario' });
  for (const [id, sp, lbl, ph] of [['m-tel-prop', S.telefonos, 'Teléfono', '09X XXX XXX'], ['m-tel-inq', S.telefonos, 'Teléfono', '09X XXX XXX'],
                                   ['m-mail-prop', S.mails, 'Mail', 'mail@ejemplo.com'], ['m-mail-inq', S.mails, 'Mail', 'mail@ejemplo.com']]) {
    chipFields[id] = makeChips(id, { split: sp, join: a => a.join(' / '), placeholder: ph, addLabel: lbl, isBusy: busy });
  }
  makePicker('m-garantia', { onAdd: addGarantiaOption, addLabel: 'Otra garantía', placeholder: 'Nombre de la garantía' });
  makePicker('m-duracion', { onAdd: t => setDuracionOption(t), addLabel: 'Otra', placeholder: 'Ej: 18 meses' });
}
