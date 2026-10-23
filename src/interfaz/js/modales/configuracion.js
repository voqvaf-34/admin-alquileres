// Ventana de Configuracion, en tres pestañas: Marca (nombre, logo, icono), Apariencia (colores,
// tema, tipografia) y Mensajes (plantillas). Todo con vista previa y se guarda recien con Guardar.
// En el primer arranque se abre como asistente: Marca y Apariencia como pasos 1 y 2.
import { COLORES_SUGERIDOS, FUENTES, ICONOS_APP, colorConPocoContraste, PLANTILLAS, TEMAS, esColor, leerMarca, paleta, rellenar, textoPlantilla,
  variablesDesconocidas } from '../../../dominios/index.js';
import { claveDisenos, claveIcono, dibujarIcono, imagenCuadrada } from '../componentes/iconos.js';
import { aplicarMarca, pintarApariencia } from '../componentes/marca.js';
import { call } from '../nucleo/api.js';
import { $, cargarImagen, esc, leerComoDataURL, showToast } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { closeModal, openModal } from '../nucleo/modales.js';

// Lo que se esta editando (el icono "aplanado": iconoTipo, iconoDiseno, iconoColor, iconoImagen).
let borrador = {};

// Modo de color y accesibilidad al abrir (se aplican en el momento; Cancelar los vuelve atras).
let modoAlAbrir = 'auto', a11yAlAbrir = null;

const TAMANOS = [[0.9, 'Chico'], [1, 'Normal'], [1.15, 'Grande'], [1.3, 'Más grande'], [1.5, 'Enorme']];

// Asistente de primer uso: pasos y que hacer al terminar.
const PASOS = ['marca', 'apariencia', 'accesibilidad'];
let asistente = null;   // { paso, alTerminar }

// Datos inventados para el ejemplo de cada mensaje.
const EJEMPLO = { vencimiento: '01/11/2026', direccion: 'Torre Ceibo - Av. Italia 875 U403', inquilino: 'Beto Gomez',
  propietario: 'Ana Perez', porcentaje: '3,16%', nuevo_importe: '$ 25.790' };

const LOGO_MAX_ALTO = 160, LOGO_MAX_ANCHO = 640, LOGO_MAX_BYTES = 400 * 1024;

const marcaBorrador = () => leerMarca({
  marcaNombre: borrador.nombre, marcaColor: borrador.color, marcaColor2: borrador.color2, marcaLogo: borrador.logo,
  marcaTema: borrador.tema, marcaFuente: borrador.fuente, marcaIconoTipo: borrador.iconoTipo, marcaIconoDiseno: borrador.iconoDiseno,
  marcaIconoColor: borrador.iconoColor, marcaIconoImagen: borrador.iconoImagen,
});

// ── Pestañas ──
function mostrarPestana(id) {
  document.querySelectorAll('[data-cfg-tab]').forEach(b => b.classList.toggle('on', b.dataset.cfgTab === id));
  document.querySelectorAll('[data-cfg-panel]').forEach(p => { p.hidden = p.dataset.cfgPanel !== id; });
  $('cfg-preview-wrap').hidden = id === 'mensajes' || id === 'accesibilidad';
  if (asistente) {
    asistente.paso = PASOS.indexOf(id);
    document.querySelectorAll('[data-cfg-tab]').forEach(b => b.classList.toggle('hecho', PASOS.indexOf(b.dataset.cfgTab) < asistente.paso));
    $('cfg-atras').hidden = asistente.paso === 0;
    const ultimo = asistente.paso === PASOS.length - 1;
    $('cfg-siguiente').hidden = ultimo;
    $('cfg-guardar').hidden = !ultimo;
  }
}

// ── Vista previa y controles ──
function pintarColor(picker, valor, mismo) {
  const box = document.querySelector(`[data-color-picker="${picker}"]`);
  box.querySelector('.cfg-color').value = valor.toLowerCase();
  const hex = box.querySelector('.cfg-color-hex');
  if (document.activeElement !== hex) hex.value = mismo ? '' : valor;
  hex.placeholder = mismo ? valor : '';
  hex.classList.remove('invalido');
  box.querySelectorAll('.cfg-swatch').forEach(b => b.classList.toggle('on', !mismo && b.dataset.color === valor));
}

function pintarBorrador() {
  const marca = marcaBorrador();
  const p = paleta(marca.color, marca.color2);
  pintarApariencia($('cfg-preview'), marca);
  pintarApariencia($('cfg-logo-preview'), marca);
  pintarApariencia($('cfg-temas'), marca);
  $('cfg-prev-nombre').textContent = marca.nombre;
  $('cfg-prev-nombre').hidden = !!marca.logo;
  for (const img of [$('cfg-prev-logo'), $('cfg-logo-img')]) {
    if (marca.logo) img.src = marca.logo; else img.removeAttribute('src');
    img.hidden = !marca.logo;
  }
  $('cfg-logo-vacio').hidden = !!marca.logo;
  $('cfg-logo-quitar').disabled = !marca.logo;
  pintarIcono(marca);
  pintarColor('color', marca.color, false);
  const flojos = [marca.color, marca.color2].filter(c => c && colorConPocoContraste(c));
  $('cfg-color-aviso').textContent = flojos.length
    ? 'Con este color, ni el texto blanco ni el oscuro llegan al contraste recomendado: puede costar leer la barra y los botones. Probá uno un poco más claro o más oscuro.' : '';
  pintarColor('color2', p.sec, !marca.color2);
  $('cfg-color2-mismo').classList.toggle('on', !marca.color2);
  document.querySelectorAll('.cfg-tema').forEach(b => b.classList.toggle('on', b.dataset.tema === marca.tema));
  document.querySelectorAll('.cfg-fuente').forEach(b => b.classList.toggle('on', b.dataset.fuente === marca.fuente));
  for (const id of Object.keys(PLANTILLAS)) pintarEjemplo(id);
}

// ── Icono de la app ──
// Los iconos se redibujan solo si cambio algo que los afecta (no con cada letra del nombre).
let dibujoPendiente = 0, claveIconoDibujado = null, claveDisenosDibujados = null;
function pintarIcono(marca) {
  // Si el tipo elegido no se puede usar (p. ej. "Mi logo" sin logo) se muestra el que va a quedar.
  const tipo = marca.icono.tipo;
  document.querySelectorAll('[data-icono-tipo]').forEach(b => b.classList.toggle('active', b.dataset.iconoTipo === tipo));
  document.querySelector('[data-icono-tipo="logo"]').disabled = !marca.logo;
  document.querySelector('[data-icono-tipo="logo"]').title = marca.logo ? '' : 'Primero cargá un logo';
  document.querySelectorAll('[data-icono-panel]').forEach(p => { p.hidden = p.dataset.iconoPanel !== tipo; });
  pintarColor('iconoColor', marca.icono.color || marca.color, !marca.icono.color);
  $('cfg-iconoColor-mismo').classList.toggle('on', !marca.icono.color);
  if (claveIcono(marca) !== claveIconoDibujado) {
    claveIconoDibujado = claveIcono(marca);
    const n = ++dibujoPendiente;
    dibujarIcono(marca, 128).then(png => { if (n === dibujoPendiente) { $('cfg-icono-img').src = png; $('cfg-icono-chico').src = png; } }).catch(() => {});
  }
  // Botones de diseños, dibujados con el color actual.
  const redibujarDisenos = claveDisenos(marca) !== claveDisenosDibujados;
  claveDisenosDibujados = claveDisenos(marca);
  for (const b of document.querySelectorAll('.cfg-diseno')) {
    b.classList.toggle('on', b.dataset.diseno === marca.icono.diseno);
    if (redibujarDisenos) dibujarIcono({ ...marca, icono: { ...marca.icono, tipo: 'app', diseno: b.dataset.diseno } }, 76)
      .then(png => { b.querySelector('img').src = png; }).catch(() => {});
  }
}

function armarIcono() {
  $('cfg-disenos').innerHTML = Object.entries(ICONOS_APP).map(([id, nombre]) =>
    `<button type="button" class="cfg-diseno" data-diseno="${id}" title="${esc(nombre)}"><img alt="${esc(nombre)}"></button>`).join('');
  $('cfg-disenos').addEventListener('click', e => {
    const b = e.target.closest('.cfg-diseno'); if (!b) return;
    borrador.iconoDiseno = b.dataset.diseno; pintarBorrador();
  });
  $('cfg-icono-tipos').addEventListener('click', e => {
    const b = e.target.closest('[data-icono-tipo]'); if (!b || b.disabled) return;
    borrador.iconoTipo = b.dataset.iconoTipo;
    pintarBorrador();
    if (borrador.iconoTipo === 'imagen' && !borrador.iconoImagen) $('cfg-icono-file').click();
  });
  $('cfg-iconoColor-mismo').addEventListener('click', () => { borrador.iconoColor = ''; pintarBorrador(); });
  $('cfg-icono-elegir').addEventListener('click', () => $('cfg-icono-file').click());
  $('cfg-icono-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) { if (!borrador.iconoImagen) { borrador.iconoTipo = 'app'; pintarBorrador(); } return; }
    try {
      borrador.iconoImagen = await imagenCuadrada(await leerComoDataURL(file));
      borrador.iconoTipo = 'imagen';
    } catch (_) { showToast('No se pudo leer la imagen.', 'err'); }
    pintarBorrador();
  });
}

function pintarModo() {
  const modo = Theme.getModo();
  document.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('active', b.dataset.modo === modo));
  const oscuro = Theme.get() === 'dark';
  $('cfg-preview').classList.toggle('oscuro', oscuro);
  $('cfg-preview').classList.toggle('claro', !oscuro);
  $('cfg-prev-modo').textContent = oscuro ? 'Ver en modo claro' : 'Ver en modo oscuro';
}

// ── Accesibilidad ──
function pintarA11y() {
  const p = A11y.get();
  document.querySelectorAll('.cfg-tamano').forEach(b => {
    const on = +b.dataset.tamano === +p.tamano;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
  });
  document.querySelectorAll('[data-a11y]').forEach(i => { i.checked = !!p[i.dataset.a11y]; });
  document.querySelectorAll('[data-anim]').forEach(b => {
    const on = b.dataset.anim === p.animaciones;
    b.classList.toggle('active', on); b.setAttribute('aria-checked', on);
  });
}

function armarAccesibilidad() {
  $('cfg-tamanos').innerHTML = TAMANOS.map(([f, nombre]) =>
    `<button type="button" class="cfg-tamano" role="radio" data-tamano="${f}"><b style="font-size:${Math.round(14 * f)}px">Aa</b><small>${nombre} · ${Math.round(f * 100)}%</small></button>`).join('');
  document.querySelectorAll('[data-anim]').forEach(b => b.setAttribute('role', 'radio'));
  $('cfg-tamanos').addEventListener('click', e => {
    const b = e.target.closest('.cfg-tamano'); if (!b) return;
    A11y.set({ tamano: +b.dataset.tamano }); pintarA11y();
  });
  document.querySelectorAll('[data-a11y]').forEach(i => i.addEventListener('change', () => { A11y.set({ [i.dataset.a11y]: i.checked }); pintarA11y(); }));
  $('cfg-anim').addEventListener('click', e => {
    const b = e.target.closest('[data-anim]'); if (!b) return;
    A11y.set({ animaciones: b.dataset.anim }); pintarA11y();
  });
  $('cfg-a11y-normal').addEventListener('click', () => { A11y.set(A11y.DEFAULT); pintarA11y(); });
}

function armarApariencia() {
  $('cfg-modos').addEventListener('click', e => {
    const b = e.target.closest('[data-modo]'); if (!b) return;
    Theme.setModo(b.dataset.modo);
  });
  document.addEventListener('modo-color', () => { if ($('modal-config').classList.contains('open')) pintarModo(); });
  // Cancelar (o la X) deja el modo como estaba.
  const deshacerPreferencias = () => { Theme.setModo(modoAlAbrir); if (a11yAlAbrir) A11y.set(a11yAlAbrir); };
  $('cfg-cancelar').addEventListener('click', deshacerPreferencias);
  document.querySelector('#modal-config .modal-x').addEventListener('click', deshacerPreferencias);

  document.querySelectorAll('[data-color-picker] .cfg-sugeridos').forEach(box => {
    box.innerHTML = COLORES_SUGERIDOS.map(c =>
      `<button type="button" class="cfg-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
  });
  document.querySelectorAll('[data-color-picker]').forEach(box => {
    const campo = box.dataset.colorPicker;
    box.addEventListener('click', e => {
      const b = e.target.closest('.cfg-swatch'); if (!b) return;
      borrador[campo] = b.dataset.color; pintarBorrador();
    });
    box.querySelector('.cfg-color').addEventListener('input', e => { borrador[campo] = e.target.value.toUpperCase(); pintarBorrador(); });
    const hex = box.querySelector('.cfg-color-hex');
    hex.addEventListener('input', e => {
      let v = e.target.value.trim(); if (v && v[0] !== '#') v = '#' + v;
      if (esColor(v)) { borrador[campo] = v.toUpperCase(); pintarBorrador(); }
      else e.target.classList.add('invalido');
    });
    hex.addEventListener('blur', pintarBorrador);
  });
  $('cfg-color2-mismo').addEventListener('click', () => { borrador.color2 = ''; pintarBorrador(); });

  $('cfg-temas').innerHTML = Object.entries(TEMAS).map(([id, t]) => {
    const [fondo, tarjeta] = t.muestra || ['var(--m-tinte-bg)', 'var(--m-tinte-surface)'];
    const [fondoDk, tarjetaDk] = t.oscuro || ['var(--m-tinte-bg-dk)', 'var(--m-tinte-panel-dk)'];
    return `<button type="button" class="cfg-tema" data-tema="${id}">
      <div class="cfg-tema-muestra" style="--muestra-bg:${fondo};--muestra-card:${tarjeta};--muestra-bg-dk:${fondoDk};--muestra-card-dk:${tarjetaDk}"></div>${esc(t.nombre)}</button>`;
  }).join('');
  $('cfg-temas').addEventListener('click', e => {
    const b = e.target.closest('.cfg-tema'); if (!b) return;
    borrador.tema = b.dataset.tema; pintarBorrador();
  });

  $('cfg-fuentes').innerHTML = Object.entries(FUENTES).map(([id, f]) =>
    `<button type="button" class="cfg-fuente" data-fuente="${id}" style="font-family:${esc(f.css)}">Alquileres<small>${esc(f.nombre)}</small></button>`).join('');
  $('cfg-fuentes').addEventListener('click', e => {
    const b = e.target.closest('.cfg-fuente'); if (!b) return;
    borrador.fuente = b.dataset.fuente; pintarBorrador();
  });

  $('cfg-prev-modo').addEventListener('click', () => {
    const oscuro = !$('cfg-preview').classList.contains('oscuro');
    $('cfg-preview').classList.toggle('oscuro', oscuro);
    $('cfg-preview').classList.toggle('claro', !oscuro);
    $('cfg-prev-modo').textContent = oscuro ? 'Ver en modo claro' : 'Ver en modo oscuro';
  });
}

// ── Mensajes ──
const msgArea = id => document.querySelector(`[data-msg="${id}"] textarea`);

function pintarEjemplo(id) {
  const box = document.querySelector(`[data-msg="${id}"]`);
  const texto = msgArea(id).value;
  const nombre = leerMarca({ marcaNombre: borrador.nombre }).nombre;
  const datos = Object.fromEntries(Object.entries({ inmobiliaria: nombre, ...EJEMPLO }).map(([k, v]) => [k, `<b>${esc(v)}</b>`]));
  box.querySelector('.cfg-ejemplo').innerHTML = 'Ejemplo: ' + rellenar(esc(texto), datos);
  const malas = variablesDesconocidas(id, texto);
  box.querySelector('.cfg-aviso').textContent = malas.length ? `Este mensaje no conoce: ${malas.map(v => `{${v}}`).join(', ')}` : '';
  box.querySelector('.cfg-restaurar').disabled = texto.trim() === PLANTILLAS[id].texto;
}

function armarMensajes() {
  $('cfg-mensajes').innerHTML = Object.entries(PLANTILLAS).map(([id, p]) => `
    <details class="m-disclosure cfg-msg" data-msg="${id}">
      <summary>${esc(p.titulo)}</summary>
      <textarea spellcheck="true" aria-label="${esc(p.titulo)}"></textarea>
      <div class="cfg-vars">
        ${p.variables.map(v => `<button type="button" class="cfg-var" data-var="${v}" title="Insertar">{${v}}</button>`).join('')}
        <button type="button" class="cfg-restaurar">Restaurar texto original</button>
      </div>
      <div class="cfg-aviso"></div>
      <div class="cfg-ejemplo"></div>
    </details>`).join('');
  $('cfg-mensajes').addEventListener('input', e => { const b = e.target.closest('[data-msg]'); if (b) pintarEjemplo(b.dataset.msg); });
  $('cfg-mensajes').addEventListener('click', e => {
    const box = e.target.closest('[data-msg]'); if (!box) return;
    const ta = box.querySelector('textarea'), id = box.dataset.msg;
    const v = e.target.closest('.cfg-var');
    if (v) {
      const ins = `{${v.dataset.var}}`, a = ta.selectionStart, z = ta.selectionEnd;
      ta.value = ta.value.slice(0, a) + ins + ta.value.slice(z);
      ta.focus(); ta.selectionStart = ta.selectionEnd = a + ins.length;
      pintarEjemplo(id);
    } else if (e.target.closest('.cfg-restaurar')) {
      ta.value = PLANTILLAS[id].texto; pintarEjemplo(id);
    }
  });
}

// ── Abrir ──
function cargar() {
  claveIconoDibujado = claveDisenosDibujados = null;   // al abrir se dibuja todo de nuevo
  const actual = leerMarca(estado.appSettings);
  const { icono, ...resto } = actual;
  borrador = { ...resto, nombre: estado.appSettings.marcaNombre || '',
    iconoTipo: icono.tipo, iconoDiseno: icono.diseno, iconoColor: icono.color, iconoImagen: icono.imagen };
  $('cfg-nombre').value = borrador.nombre;
  for (const id of Object.keys(PLANTILLAS)) {
    msgArea(id).value = textoPlantilla(estado.appSettings, id);
    document.querySelector(`[data-msg="${id}"]`).open = false;
  }
  modoAlAbrir = Theme.getModo();
  a11yAlAbrir = A11y.get();
  pintarModo();
  pintarA11y();
  pintarBorrador();
}

function modoAsistente(activo) {
  $('modal-config').classList.toggle('asistente', activo);
  $('cfg-titulo').textContent = activo ? 'Primeros pasos' : 'Configuración';
  $('cfg-bienvenida').hidden = !activo;
  $('cfg-saltar').hidden = !activo;
  $('cfg-cancelar').hidden = activo;
  document.querySelector('#modal-config .modal-x').hidden = activo;
  document.querySelector('[data-cfg-tab="mensajes"]').hidden = activo;
  document.querySelectorAll('[data-cfg-tab]').forEach(b => {
    const n = PASOS.indexOf(b.dataset.cfgTab) + 1;
    b.innerHTML = (activo && n ? `<span class="cfg-paso">${n}</span>` : '') + b.dataset.cfgTab[0].toUpperCase() + b.dataset.cfgTab.slice(1);
  });
  $('cfg-guardar').textContent = activo ? 'Listo' : 'Guardar';
  if (!activo) { $('cfg-atras').hidden = $('cfg-siguiente').hidden = true; $('cfg-guardar').hidden = false; }
}

export function abrirConfiguracion() {
  asistente = null;
  modoAsistente(false);
  cargar();
  mostrarPestana('marca');
  openModal('modal-config');
  setTimeout(() => $('cfg-nombre').focus(), 80);
}

// Primer arranque: los mismos campos, paso a paso. alTerminar se llama al guardar o al saltear.
export function abrirAsistente(alTerminar) {
  asistente = { paso: 0, alTerminar };
  modoAsistente(true);
  cargar();
  mostrarPestana('marca');
  openModal('modal-config');
  setTimeout(() => $('cfg-nombre').focus(), 80);
}

function terminarAsistente() {
  const fin = asistente && asistente.alTerminar;
  asistente = null;
  closeModal('modal-config');
  modoAsistente(false);
  if (fin) fin();
}

// Achica la imagen para que la base no crezca de mas (el logo se guarda dentro de la base).
async function leerLogo(file) {
  const url = await leerComoDataURL(file);
  if (file.type === 'image/svg+xml') {
    if (url.length > LOGO_MAX_BYTES) throw new Error('El SVG es demasiado grande.');
    return url;
  }
  const img = await cargarImagen(url);
  const k = Math.min(1, LOGO_MAX_ALTO / img.height, LOGO_MAX_ANCHO / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const out = c.toDataURL('image/png');
  return out.length > LOGO_MAX_BYTES ? c.toDataURL('image/webp', 0.9) : out;
}

async function guardar() {
  try {
    const mensajes = Object.fromEntries(Object.keys(PLANTILLAS).map(id => [id, msgArea(id).value]));
    const m = marcaBorrador();
    const marca = { nombre: $('cfg-nombre').value.trim(), color: m.color, color2: m.color2, logo: m.logo, tema: m.tema,
      fuente: m.fuente, icono: { ...m.icono, imagen: borrador.iconoImagen } };
    const st = await call('saveConfig', { marca, mensajes, asistente: !!asistente });
    estado.appSettings = st.settings;
    aplicarMarca(estado.appSettings);
    if (asistente) return terminarAsistente();
    closeModal('modal-config');
    showToast('&#10003; Configuración guardada', 'ok');
  } catch (err) { showToast('Error al guardar: ' + esc(err.message), 'err'); }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  armarMensajes();
  armarApariencia();
  armarIcono();
  armarAccesibilidad();
  document.querySelectorAll('[data-cfg-tab]').forEach(b => b.addEventListener('click', () => mostrarPestana(b.dataset.cfgTab)));
  $('cfg-nombre').addEventListener('input', e => { borrador.nombre = e.target.value; pintarBorrador(); });

  $('cfg-logo-elegir').addEventListener('click', () => $('cfg-logo-file').click());
  $('cfg-logo-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { borrador.logo = await leerLogo(file); pintarBorrador(); }
    catch (err) { showToast(esc(err.message), 'err'); }
  });
  $('cfg-logo-quitar').addEventListener('click', () => { borrador.logo = ''; if (borrador.iconoTipo === 'logo') borrador.iconoTipo = 'app'; pintarBorrador(); });

  $('cfg-siguiente').addEventListener('click', () => mostrarPestana(PASOS[asistente.paso + 1]));
  $('cfg-atras').addEventListener('click', () => mostrarPestana(PASOS[asistente.paso - 1]));
  $('cfg-saltar').addEventListener('click', async () => {
    try { await call('setSetting', 'asistenteVisto', '1'); estado.appSettings.asistenteVisto = '1'; } catch (_) {}
    terminarAsistente();
  });
  $('cfg-guardar').addEventListener('click', guardar);
  $('btn-config').addEventListener('click', abrirConfiguracion);
}
