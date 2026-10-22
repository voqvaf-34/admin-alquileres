// Ventana de Configuracion: nombre, color y logo de la inmobiliaria (con vista previa).
import { COLORES_SUGERIDOS, esColor, leerMarca } from '../../../dominios/index.js';
import { aplicarMarca, pintarVariables } from '../componentes/marca.js';
import { call } from '../nucleo/api.js';
import { esc, showToast } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { closeModal, openModal } from '../nucleo/modales.js';

const $ = id => document.getElementById(id);

// Lo que se esta editando (se guarda recien con Guardar).
let borrador = { nombre: '', color: '', logo: '' };

const LOGO_MAX_ALTO = 160, LOGO_MAX_ANCHO = 640, LOGO_MAX_BYTES = 400 * 1024;

function pintarBorrador() {
  const marca = leerMarca({ marcaNombre: borrador.nombre, marcaColor: borrador.color, marcaLogo: borrador.logo });
  pintarVariables($('cfg-preview'), marca.color);
  pintarVariables($('cfg-logo-preview'), marca.color);
  $('cfg-prev-nombre').textContent = marca.nombre;
  $('cfg-prev-nombre').hidden = !!marca.logo;
  for (const img of [$('cfg-prev-logo'), $('cfg-logo-img')]) {
    if (marca.logo) img.src = marca.logo; else img.removeAttribute('src');
    img.hidden = !marca.logo;
  }
  $('cfg-logo-vacio').hidden = !!marca.logo;
  $('cfg-logo-quitar').disabled = !marca.logo;
  $('cfg-color').value = marca.color.toLowerCase();
  if (document.activeElement !== $('cfg-color-hex')) $('cfg-color-hex').value = marca.color;
  $('cfg-color-hex').classList.remove('invalido');
  document.querySelectorAll('.cfg-swatch').forEach(b => b.classList.toggle('on', b.dataset.color === marca.color));
}

export function abrirConfiguracion() {
  const actual = leerMarca(estado.appSettings);
  borrador = { nombre: estado.appSettings.marcaNombre || '', color: actual.color, logo: actual.logo };
  $('cfg-nombre').value = borrador.nombre;
  pintarBorrador();
  openModal('modal-config');
  setTimeout(() => $('cfg-nombre').focus(), 80);
}

// Achica la imagen para que la base no crezca de mas (el logo se guarda dentro de la base).
function leerLogo(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    fr.onload = () => {
      const url = fr.result;
      if (file.type === 'image/svg+xml') {
        if (url.length > LOGO_MAX_BYTES) return reject(new Error('El SVG es demasiado grande.'));
        return resolve(url);
      }
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen valida.'));
      img.onload = () => {
        const k = Math.min(1, LOGO_MAX_ALTO / img.height, LOGO_MAX_ANCHO / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/png');
        resolve(out.length > LOGO_MAX_BYTES ? c.toDataURL('image/webp', 0.9) : out);
      };
      img.src = url;
    };
    fr.readAsDataURL(file);
  });
}

async function guardar() {
  const nombre = $('cfg-nombre').value.trim();
  try {
    const st = await call('saveBrand', { nombre, color: borrador.color, logo: borrador.logo });
    estado.appSettings = st.settings;
    aplicarMarca(estado.appSettings);
    closeModal('modal-config');
    showToast('&#10003; Configuración guardada', 'ok');
  } catch (err) { showToast('Error al guardar: ' + esc(err.message), 'err'); }
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  $('cfg-sugeridos').innerHTML = COLORES_SUGERIDOS.map(c =>
    `<button type="button" class="cfg-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
  $('cfg-sugeridos').addEventListener('click', e => {
    const b = e.target.closest('.cfg-swatch'); if (!b) return;
    borrador.color = b.dataset.color; pintarBorrador();
  });
  $('cfg-color').addEventListener('input', e => { borrador.color = e.target.value.toUpperCase(); pintarBorrador(); });
  $('cfg-color-hex').addEventListener('input', e => {
    let v = e.target.value.trim(); if (v && v[0] !== '#') v = '#' + v;
    if (esColor(v)) { borrador.color = v.toUpperCase(); pintarBorrador(); }
    else e.target.classList.add('invalido');
  });
  $('cfg-color-hex').addEventListener('blur', pintarBorrador);
  $('cfg-nombre').addEventListener('input', e => { borrador.nombre = e.target.value; pintarBorrador(); });

  $('cfg-logo-elegir').addEventListener('click', () => $('cfg-logo-file').click());
  $('cfg-logo-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { borrador.logo = await leerLogo(file); pintarBorrador(); }
    catch (err) { showToast(esc(err.message), 'err'); }
  });
  $('cfg-logo-quitar').addEventListener('click', () => { borrador.logo = ''; pintarBorrador(); });

  $('cfg-guardar').addEventListener('click', guardar);
  $('btn-config').addEventListener('click', abrirConfiguracion);
}
