// Pestaña Administraciones: tabla y formulario.
import { nuevosPrimero, puntoNuevo } from '../componentes/novedades.js';
import { normalizar } from '../../../dominios/index.js';
import { render } from '../app.js';
import { call } from '../nucleo/api.js';
import { esc, showToast } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { fmtEdificios, linkMailsInText, linkPhonesInText } from '../nucleo/formato.js';

let adminSearchText  = '';

let adminEditRow     = null;  // id de la administracion en edicion (null = alta nueva)

function getAdminFiltered() {
  if (!estado.admins) return [];
  if (!adminSearchText.trim()) return estado.admins;
  const q = normalizar(adminSearchText);
  return estado.admins.filter(a =>
    normalizar(a.nombre).includes(q) ||
    normalizar(a.edificios).includes(q) ||
    normalizar(a.telefono).includes(q) ||
    normalizar(a.mail).includes(q)
  );
}

export function renderAdminTable() {
  if (!estado.admins) return;
  const filtered = getAdminFiltered();
  const countEl = document.getElementById('admin-count');
  if (countEl) countEl.textContent = `${filtered.length} / ${estado.admins.length} administraciones`;

  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Sin resultados.</td></tr>`;
    return;
  }

  tbody.innerHTML = nuevosPrimero('administraciones', filtered).map(a => `
    <tr data-admin-row="${a.id}">
      <td style="font-weight:600">${esc(a.nombre)}</td>
      <td>${fmtEdificios(a.edificios)}</td>
      <td>${linkPhonesInText(a.telefono)}</td>
      <td>${linkMailsInText(a.mail)}</td>
      <td style="white-space:nowrap;text-align:right">${puntoNuevo('administraciones', a.id)}
        <button class="unmark-btn" data-admin-edit="${a.id}" title="Editar">&#9998;</button>
        <button class="unmark-btn" data-admin-del="${a.id}" title="Eliminar">&times;</button>
      </td>
    </tr>`).join('');
}

function showAdminModal(entry) {
  adminEditRow = entry ? entry.id : null;
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

  const payload = {
    id:        adminEditRow,
    nombre,
    edificios: (document.getElementById('m-adm-edificios').value || '').trim(),
    telefono:  (document.getElementById('m-adm-telefono').value  || '').trim(),
    mail:      (document.getElementById('m-adm-mail').value      || '').trim(),
  };

  const btn = document.getElementById('modal-admin-submit');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';
  try {
    estado.admins = await call('saveAdmin', payload);
    showToast('&#10003; Administracion guardada', 'ok');
    hideAdminModal();
    render();
  } catch (err) {
    showToast('Error: ' + esc(err.message), 'err');
    btn.disabled    = false;
    btn.textContent = 'Guardar';
  }
}

async function deleteAdminEntry(id, nombre) {
  if (!confirm(`Eliminar "${nombre}"?`)) return;
  try {
    estado.admins = await call('deleteAdmin', id);
    showToast('&#10003; Administracion eliminada', 'ok');
    render();
  } catch (err) {
    showToast('Error: ' + esc(err.message), 'err');
  }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Buscador Administraciones
  document.getElementById('admin-search').addEventListener('input', e => {
    adminSearchText = e.target.value;
    e.target.closest('.search-wrap').classList.toggle('has-text', !!e.target.value);
    renderAdminTable();
  });

  document.getElementById('admin-search-clear').addEventListener('click', () => {
    const inp = document.getElementById('admin-search');
    inp.value = ''; adminSearchText = '';
    inp.closest('.search-wrap').classList.remove('has-text');
    inp.focus(); renderAdminTable();
  });

  // Modal agregar/editar administracion
  document.getElementById('btn-add-admin').addEventListener('click', () => showAdminModal(null));
  document.getElementById('modal-admin-close').addEventListener('click', hideAdminModal);
  document.getElementById('modal-admin-cancel').addEventListener('click', hideAdminModal);
  document.getElementById('modal-admin-submit').addEventListener('click', submitAdminEntry);
  // Los formularios (alta/edicion) solo se cierran con Cancelar o Guardar: un clic afuera
  // o Escape no hacen perder lo cargado.

  // Acciones de fila en tabla Administraciones (editar / eliminar)
  document.getElementById('admin-tbody').addEventListener('click', e => {
    const editBtn = e.target.closest('[data-admin-edit]');
    if (editBtn) {
      const entry = estado.admins && estado.admins.find(a => a.id === +editBtn.dataset.adminEdit);
      if (entry) showAdminModal(entry);
      return;
    }
    const delBtn = e.target.closest('[data-admin-del]');
    if (delBtn) {
      const id    = +delBtn.dataset.adminDel;
      const entry = estado.admins && estado.admins.find(a => a.id === id);
      deleteAdminEntry(id, entry ? entry.nombre : '');
      return;
    }
  });
}
