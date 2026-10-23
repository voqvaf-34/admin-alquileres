// Utilidades de pantalla: avisos (toast), escape de HTML, portapapeles, archivos e imagenes.

let _toastTimer = null;

export function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.innerHTML = msg;
  el.className  = 'show ' + (type||'');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 3800);
}

export function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
}

// Atajo para buscar un elemento por id.
export const $ = id => document.getElementById(id);

// Contenido de una imagen elegida por el usuario, como data URL ("data:image/png;base64,...").
export function leerComoDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    fr.readAsDataURL(file);
  });
}

// Imagen ya cargada (para dibujarla en un canvas).
export function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('El archivo no es una imagen valida.'));
    img.src = src;
  });
}
