// Pestaña Administraciones: tabla y formulario.
import { nuevosPrimero, puntoNuevo } from '../componentes/novedades.js';
import { normalizar } from '../../../dominios/index.js';
import { dibujar } from '../app.js';
import { call } from '../nucleo/api.js';
import { esc, mostrarAviso } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { formatearEdificios, enlazarMailsEnTexto, enlazarTelefonosEnTexto } from '../nucleo/formato.js';

let textoBusquedaAdmins  = '';

let filaAdminEditando     = null;  // id de la administracion en edicion (null = alta nueva)

function adminsFiltradas() {
  if (!estado.administraciones) return [];
  if (!textoBusquedaAdmins.trim()) return estado.administraciones;
  const q = normalizar(textoBusquedaAdmins);
  return estado.administraciones.filter(a =>
    normalizar(a.nombre).includes(q) ||
    normalizar(a.edificios).includes(q) ||
    normalizar(a.telefono).includes(q) ||
    normalizar(a.mail).includes(q)
  );
}

export function dibujarTablaAdmins() {
  if (!estado.administraciones) return;
  const filtrados = adminsFiltradas();
  const elCantidad = document.getElementById('admin-count');
  if (elCantidad) elCantidad.textContent = `${filtrados.length} / ${estado.administraciones.length} administraciones`;

  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Sin resultados.</td></tr>`;
    return;
  }

  tbody.innerHTML = nuevosPrimero('administraciones', filtrados).map(a => `
    <tr data-admin-row="${a.id}">
      <td style="font-weight:600">${esc(a.nombre)}</td>
      <td>${formatearEdificios(a.edificios)}</td>
      <td>${enlazarTelefonosEnTexto(a.telefono)}</td>
      <td>${enlazarMailsEnTexto(a.mail)}</td>
      <td style="white-space:nowrap;text-align:right">${puntoNuevo('administraciones', a.id)}
        <button class="unmark-btn" data-admin-edit="${a.id}" title="Editar">&#9998;</button>
        <button class="unmark-btn" data-admin-del="${a.id}" title="Eliminar">&times;</button>
      </td>
    </tr>`).join('');
}

function mostrarModalAdmin(entrada) {
  filaAdminEditando = entrada ? entrada.id : null;
  document.getElementById('modal-admin-title').textContent = entrada ? 'Editar Administracion' : 'Nueva Administracion';
  document.getElementById('m-adm-nombre').value    = entrada ? entrada.nombre    : '';
  document.getElementById('m-adm-edificios').value = entrada ? entrada.edificios : '';
  document.getElementById('m-adm-telefono').value  = entrada ? entrada.telefono  : '';
  document.getElementById('m-adm-mail').value      = entrada ? entrada.mail      : '';
  const btn = document.getElementById('modal-admin-submit');
  btn.disabled = false;
  btn.textContent = 'Guardar';
  document.getElementById('modal-admin').classList.add('open');
  setTimeout(() => document.getElementById('m-adm-nombre').focus(), 80);
}

function ocultarModalAdmin() {
  document.getElementById('modal-admin').classList.remove('open');
}

async function enviarAdmin() {
  const nombre = (document.getElementById('m-adm-nombre').value || '').trim();
  if (!nombre) { mostrarAviso('El nombre de la administracion es obligatorio.', 'err'); return; }

  const carga = {
    id:        filaAdminEditando,
    nombre,
    edificios: (document.getElementById('m-adm-edificios').value || '').trim(),
    telefono:  (document.getElementById('m-adm-telefono').value  || '').trim(),
    mail:      (document.getElementById('m-adm-mail').value      || '').trim(),
  };

  const btn = document.getElementById('modal-admin-submit');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';
  try {
    estado.administraciones = await call('guardarAdmin', carga);
    mostrarAviso('&#10003; Administracion guardada', 'ok');
    ocultarModalAdmin();
    dibujar();
  } catch (err) {
    mostrarAviso('Error: ' + esc(err.message), 'err');
    btn.disabled    = false;
    btn.textContent = 'Guardar';
  }
}

async function borrarEntradaAdmin(id, nombre) {
  if (!confirm(`Eliminar "${nombre}"?`)) return;
  try {
    estado.administraciones = await call('borrarAdmin', id);
    mostrarAviso('&#10003; Administracion eliminada', 'ok');
    dibujar();
  } catch (err) {
    mostrarAviso('Error: ' + esc(err.message), 'err');
  }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Buscador Administraciones
  document.getElementById('admin-search').addEventListener('input', e => {
    textoBusquedaAdmins = e.target.value;
    e.target.closest('.search-wrap').classList.toggle('has-text', !!e.target.value);
    dibujarTablaAdmins();
  });

  document.getElementById('admin-search-clear').addEventListener('click', () => {
    const inp = document.getElementById('admin-search');
    inp.value = ''; textoBusquedaAdmins = '';
    inp.closest('.search-wrap').classList.remove('has-text');
    inp.focus(); dibujarTablaAdmins();
  });

  // Modal agregar/editar administracion
  document.getElementById('btn-add-admin').addEventListener('click', () => mostrarModalAdmin(null));
  document.getElementById('modal-admin-close').addEventListener('click', ocultarModalAdmin);
  document.getElementById('modal-admin-cancel').addEventListener('click', ocultarModalAdmin);
  document.getElementById('modal-admin-submit').addEventListener('click', enviarAdmin);
  // Los formularios (alta/edicion) solo se cierran con Cancelar o Guardar: un clic afuera
  // o Escape no hacen perder lo cargado.

  // Acciones de fila en tabla Administraciones (editar / eliminar)
  document.getElementById('admin-tbody').addEventListener('click', e => {
    const btnEditar = e.target.closest('[data-admin-edit]');
    if (btnEditar) {
      const entrada = estado.administraciones && estado.administraciones.find(a => a.id === +btnEditar.dataset.adminEdit);
      if (entrada) mostrarModalAdmin(entrada);
      return;
    }
    const btnBorrar = e.target.closest('[data-admin-del]');
    if (btnBorrar) {
      const id    = +btnBorrar.dataset.adminDel;
      const entrada = estado.administraciones && estado.administraciones.find(a => a.id === id);
      borrarEntradaAdmin(id, entrada ? entrada.nombre : '');
      return;
    }
  });
}
