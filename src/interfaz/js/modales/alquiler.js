// Formulario de alquiler (alta / edicion): viñetas, garantia, moneda, campos plegables.
import * as D from '../../../dominios/index.js';
import { Separadores } from '../../../dominios/index.js';
import { dibujar } from '../app.js';
import { _acIndice, _acOpciones, actualizarVistaDireccion } from '../componentes/autocompletado.js';
import { armarChips, armarSelector } from '../componentes/vinetas.js';
import { call } from '../nucleo/api.js';
import { esc, mostrarAviso } from '../nucleo/dom.js';
import { aplicarPropietarios, estado, reemplazarEntrada } from '../nucleo/estado.js';
import { llenarAniosBase } from '../vistas/base-datos.js';

// Base de datos
let entradaEditando    = null;   // entry que se esta editando (null = alta nueva)

export const camposConChips = {};

// Moneda del alquiler (pesos / dolares)
export function ponerMoneda(v) {
  v = v === 'USD' ? 'USD' : 'UYU';
  document.getElementById('m-moneda').value = v;
  document.querySelectorAll('#m-moneda-seg [data-moneda]').forEach(b => b.classList.toggle('active', b.dataset.moneda === v));
}

// "Quien hace los aumentos" y "Comentarios" van plegados (linea que se despliega); se abren
// solos si ya tienen datos.
function ponerCamposOpcionales(rem, notas) {
  document.getElementById('m-opt-rem').open = rem;
  document.getElementById('m-opt-notas').open = notas;
}

function mostrarModalAlta() {
  entradaEditando = null;
  ['m-edificio','m-calle','m-unidad','m-prop','m-inq','m-tel-prop','m-tel-inq','m-mail-prop','m-mail-inq','m-importe','m-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ponerOpcionDuracion('');
  document.getElementById('m-fecha').value    = '';
  document.getElementById('m-remitente').value = '';
  ponerOpcionesGarantia('');
  ponerMoneda('UYU');
  ponerCamposOpcionales(false, false);
  document.getElementById('modal-add-title').textContent = 'Nuevo Alquiler';
  const btn = document.getElementById('modal-submit');
  btn.disabled = false; btn.textContent = 'Guardar alquiler';
  actualizarVistaDireccion();
  document.getElementById('modal-add').classList.add('open');
  setTimeout(() => document.getElementById('m-edificio').focus(), 80);
}

export function mostrarModalEdicion(entrada) {
  entradaEditando = entrada;
  const set = (id, valor) => { const el = document.getElementById(id); if (el) el.value = valor || ''; };
  set('m-edificio', entrada.edificio);
  set('m-calle',    entrada.calle || (entrada.edificio ? '' : entrada.direccion));
  set('m-unidad',   entrada.unidad);
  set('m-prop',     entrada.propietario);
  set('m-tel-prop', entrada.telProp);
  set('m-mail-prop',entrada.mailProp);
  set('m-inq',      entrada.inquilino);
  set('m-tel-inq',  entrada.telInq);
  set('m-mail-inq', entrada.mailInq);
  set('m-importe',  entrada.importe || '');
  set('m-notas',    entrada.notas);
  ponerOpcionDuracion(entrada.contratoTexto || '');
  set('m-remitente', entrada.remitente);
  ponerOpcionesGarantia(entrada.garantia);
  ponerMoneda(entrada.moneda);
  ponerCamposOpcionales(!!entrada.remitente, D.comentarios(entrada).length > 0);
  document.getElementById('m-fecha').value = entrada.fechaInicio
    ? entrada.fechaInicio.getFullYear() + '-' +
      String(entrada.fechaInicio.getMonth()+1).padStart(2,'0') + '-' +
      String(entrada.fechaInicio.getDate()).padStart(2,'0')
    : '';
  document.getElementById('modal-add-title').textContent = 'Editar Alquiler';
  const btn = document.getElementById('modal-submit');
  btn.disabled = false; btn.textContent = 'Guardar cambios';
  actualizarVistaDireccion();
  document.getElementById('modal-add').classList.add('open');
  setTimeout(() => document.getElementById('m-importe').focus(), 80);
}

// Duracion: viñetas fijas (1, 2, 3 años). Si el contrato tiene otra (o se agrega con "+"),
// queda como viñeta extra solo para ese contrato.
function ponerOpcionDuracion(valor) {
  const sel = document.getElementById('m-duracion');
  sel.querySelectorAll('option[data-custom]').forEach(o => o.remove());
  const igual = [...sel.options].find(o => o.value && o.value.toLowerCase() === String(valor || '').trim().toLowerCase());
  if (igual) valor = igual.value;
  if (valor && !igual) {
    const o = document.createElement('option');
    o.value = valor; o.textContent = valor; o.dataset.custom = '1';
    sel.appendChild(o);
  }
  sel.value = valor;
}

// Opciones = las de fabrica + las que se agregaron desde la app + las que ya usa algun contrato.
function opcionesGarantia() {
  let extra = [];
  try { extra = JSON.parse((estado.ajustesApp && estado.ajustesApp.garantias) || '[]'); } catch (_) {}
  const todas = [...D.GARANTIAS_PREDETERMINADAS, ...extra, ...estado.entradas.map(e => e.garantia)].filter(Boolean);
  const vistos = new Set();
  return todas.filter(g => { const k = g.toUpperCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

function ponerOpcionesGarantia(valor) {
  const sel = document.getElementById('m-garantia');
  const opciones = opcionesGarantia();
  const coincide = opciones.find(g => g.toUpperCase() === String(valor || '').toUpperCase());
  sel.innerHTML = `<option value="">Sin cargar</option>`
    + opciones.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  sel.value = coincide || '';
  const dl = document.getElementById('dl-remitentes');
  const rems = [...new Set(estado.entradas.map(e => e.remitente).filter(Boolean))].sort();
  dl.innerHTML = rems.map(r => `<option value="${esc(r)}">`).join('');
  actualizarAyudaGestion();
}

function actualizarAyudaGestion() {
  const g = document.getElementById('m-garantia').value;
  const quien = D.gestionadoPor({ garantia: g, remitente: document.getElementById('m-remitente').value.trim() });
  document.getElementById('m-gestion-hint').textContent = quien
    ? `Los aumentos y renovaciones los gestiona ${quien}: no aparece en Aumentos ni Renovaciones.`
    : 'Los aumentos los hace la inmobiliaria.';
}

// Garantia nueva (viñeta "+"): queda elegida y guardada como opcion para los proximos.
function agregarOpcionGarantia(nombre) {
  const existe = opcionesGarantia().find(g => g.toUpperCase() === nombre.toUpperCase());
  if (!existe) {
    let extra = [];
    try { extra = JSON.parse((estado.ajustesApp && estado.ajustesApp.garantias) || '[]'); } catch (_) {}
    extra.push(nombre);
    estado.ajustesApp.garantias = JSON.stringify(extra);
    call('guardarAjuste', 'garantias', estado.ajustesApp.garantias).catch(() => {});
  }
  ponerOpcionesGarantia(existe || nombre);
}

function ocultarModalAlta() {
  document.getElementById('modal-add').classList.remove('open');
  entradaEditando = null;
}

export async function borrarEntrada(id, dir) {
  if (!confirm(`Marcar "${dir}" como INACTIVO?\n\nDejara de aparecer en aumentos y renovaciones.`)) return;
  try {
    reemplazarEntrada(await call('inactivar', id));
    mostrarAviso('&#10003; Alquiler marcado como inactivo', 'ok');
    estado.filasAbiertas.delete(id);
    dibujar();
  } catch (err) {
    mostrarAviso('Error: ' + esc(err.message), 'err');
  }
}

async function enviarAlta() {
  const edificio = document.getElementById('m-edificio').value.trim();
  const calle    = document.getElementById('m-calle').value.trim();
  const unidad   = document.getElementById('m-unidad').value.trim();
  const importe  = parseFloat(document.getElementById('m-importe').value);
  if (!edificio && !calle)      { mostrarAviso('Completá el edificio o la calle.', 'err'); return; }
  if (!importe || importe <= 0) { mostrarAviso('El importe es obligatorio.', 'err'); return; }

  const carga = {
    edificio, calle, unidad,
    propietario: (document.getElementById('m-prop').value     || '').trim(),
    telProp:     (document.getElementById('m-tel-prop').value || '').trim(),
    mailProp:    (document.getElementById('m-mail-prop').value|| '').trim(),
    inquilino:   (document.getElementById('m-inq').value      || '').trim(),
    telInq:      (document.getElementById('m-tel-inq').value  || '').trim(),
    mailInq:     (document.getElementById('m-mail-inq').value || '').trim(),
    importeBase: importe,
    contratoTexto: document.getElementById('m-duracion').value  || '',
    fechaInicio: document.getElementById('m-fecha').value     || null,  // "YYYY-MM-DD"
    notas:       [...(entradaEditando ? D.separarNotas(entradaEditando.notas).filter(D.interpretarNotaRenovacion) : []),
                  ...D.separarNotas(document.getElementById('m-notas').value)].join(' | '),
    garantia:    document.getElementById('m-garantia').value,
    moneda:      document.getElementById('m-moneda').value,
    remitente:   document.getElementById('m-remitente').value.trim(),
  };

  const esEditar = entradaEditando !== null;
  const btn = document.getElementById('modal-submit');
  btn.disabled    = true;
  btn.textContent = 'Guardando...';
  try {
    const res = esEditar
      ? await call('editarContrato', entradaEditando.id, carga)
      : await call('agregarContrato', carga);
    aplicarPropietarios(res);
    reemplazarEntrada(res.contrato);
    mostrarAviso(esEditar ? '&#10003; Alquiler actualizado' : '&#10003; Alquiler agregado correctamente', 'ok');
    ocultarModalAlta();
    llenarAniosBase();
    dibujar();
  } catch (err) {
    mostrarAviso('Error: ' + esc(err.message), 'err');
    btn.disabled    = false;
    btn.textContent = esEditar ? 'Guardar cambios' : 'Guardar alquiler';
  }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Vista previa del nombre del apto en el modal.
  ['m-edificio', 'm-calle', 'm-unidad'].forEach(id => document.getElementById(id).addEventListener('input', actualizarVistaDireccion));

  // Modal agregar alquiler
  document.getElementById('btn-add-entry').addEventListener('click', mostrarModalAlta);
  document.getElementById('modal-close').addEventListener('click', ocultarModalAlta);
  document.getElementById('modal-cancel').addEventListener('click', ocultarModalAlta);
  document.getElementById('modal-submit').addEventListener('click', enviarAlta);
  document.getElementById('m-garantia').addEventListener('change', actualizarAyudaGestion);
  document.getElementById('m-moneda-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-moneda]'); if (b) ponerMoneda(b.dataset.moneda);
  });
  // al desplegar, el cursor va al campo
  ['m-opt-rem', 'm-opt-notas'].forEach(id => document.getElementById(id).addEventListener('toggle', e => {
    if (e.target.open && document.getElementById('modal-add').classList.contains('open')) {
      const f = e.target.querySelector('input:not([type=hidden])'); if (f && !f.hidden) f.focus();
    }
  }));
  document.getElementById('m-remitente').addEventListener('input', actualizarAyudaGestion);

  // Campos con viñetas (deben existir antes del autocompletado)
  const S = Separadores, ocupado = () => _acIndice >= 0 && _acOpciones.length > 0;
  camposConChips['m-adm-edificios'] = armarChips('m-adm-edificios', { split: S.edificios, join: a => a.join('; '), placeholder: 'Nombre del edificio + Enter', etiquetaAgregar: 'Edificio' });
  camposConChips['m-adm-telefono']  = armarChips('m-adm-telefono',  { split: S.telefonos, join: a => a.join('; '), placeholder: 'Teléfono + Enter', etiquetaAgregar: 'Teléfono' });
  camposConChips['m-adm-mail']      = armarChips('m-adm-mail',      { split: S.mails,     join: a => a.join('; '), placeholder: 'Mail + Enter', etiquetaAgregar: 'Mail' });
  camposConChips['m-prop'] = armarChips('m-prop', { split: S.personas, join: a => a.join(' / '), placeholder: 'Nombre completo', etiquetaAgregar: 'Propietario', estaOcupado: ocupado });
  camposConChips['m-inq']  = armarChips('m-inq',  { split: S.personas, join: a => a.join(' / '), placeholder: 'Nombre completo', etiquetaAgregar: 'Inquilino', estaOcupado: ocupado });
  // Comentarios: las notas de renovacion no se muestran (se conservan al guardar, ver enviarAlta).
  camposConChips['m-notas'] = armarChips('m-notas', { split: s => D.comentarios({ notas: s }), join: a => a.join(' | '),
    placeholder: 'Observaciones, condiciones especiales... + Enter', etiquetaAgregar: 'Comentario' });
  for (const [id, sp, lbl, ph] of [['m-tel-prop', S.telefonos, 'Teléfono', '09X XXX XXX'], ['m-tel-inq', S.telefonos, 'Teléfono', '09X XXX XXX'],
                                   ['m-mail-prop', S.mails, 'Mail', 'mail@ejemplo.com'], ['m-mail-inq', S.mails, 'Mail', 'mail@ejemplo.com']]) {
    camposConChips[id] = armarChips(id, { split: sp, join: a => a.join(' / '), placeholder: ph, etiquetaAgregar: lbl, estaOcupado: ocupado });
  }
  armarSelector('m-garantia', { onAdd: agregarOpcionGarantia, etiquetaAgregar: 'Otra garantía', placeholder: 'Nombre de la garantía' });
  armarSelector('m-duracion', { onAdd: t => ponerOpcionDuracion(t), etiquetaAgregar: 'Otra', placeholder: 'Ej: 18 meses' });
}
