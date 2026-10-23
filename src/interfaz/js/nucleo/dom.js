// Utilidades de pantalla: avisos (toast), escape de HTML, portapapeles, archivos e imagenes.

let _temporizadorAviso = null;

export function mostrarAviso(msg, tipo) {
  const el = document.getElementById('toast');
  el.innerHTML = msg;
  el.className  = 'show ' + (tipo||'');
  if (_temporizadorAviso) clearTimeout(_temporizadorAviso);
  _temporizadorAviso = setTimeout(() => { el.className = ''; }, 3800);
}

export function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function copiarAlPortapapeles(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).catch(() => copiaAlternativa(texto));
  } else { copiaAlternativa(texto); }
}

function copiaAlternativa(texto) {
  const ta = document.createElement('textarea');
  ta.value = texto; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
}

// Atajo para buscar un elemento por id.
export const $ = id => document.getElementById(id);

// Contenido de una imagen elegida por el usuario, como data URL ("data:image/png;base64,...").
export function leerComoDataURL(archivo) {
  return new Promise((resolver, rechazar) => {
    const fr = new FileReader();
    fr.onload = () => resolver(fr.result);
    fr.onerror = () => rechazar(new Error('No se pudo leer la imagen.'));
    fr.readAsDataURL(archivo);
  });
}

// Imagen ya cargada (para dibujarla en un canvas).
export function cargarImagen(src) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('El archivo no es una imagen valida.'));
    img.src = src;
  });
}
