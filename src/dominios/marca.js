// Marca de la inmobiliaria: nombre, color principal y logo. Se guarda en la configuracion
// de la base (viaja al Visor con la copia publicada).

export const MARCA_DEFAULT = { nombre: 'Mi Inmobiliaria', color: '#2563EB', logo: '' };

// Claves en la tabla settings.
export const MARCA_KEYS = { nombre: 'marcaNombre', color: 'marcaColor', logo: 'marcaLogo' };

// Colores sugeridos en la configuracion.
export const COLORES_SUGERIDOS = ['#2563EB', '#0F766E', '#15803D', '#7C3AED', '#BE123C', '#EA580C', '#FD4108', '#334155'];

export const esColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim());

const LOGO_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_CHARS = 600 * 1024;

// Valida lo que llega de la ventana de Configuracion y devuelve las claves a guardar.
// Nombre vacio = el de por defecto; logo vacio = sin logo.
export function marcaASettings({ nombre = '', color = '', logo = '' } = {}) {
  nombre = String(nombre).replace(/\s+/g, ' ').trim();
  if (nombre.length > 60) throw new Error('El nombre puede tener hasta 60 caracteres.');
  if (!esColor(color)) throw new Error('Color no valido (formato #RRGGBB).');
  logo = String(logo || '');
  if (logo && !LOGO_RE.test(logo)) throw new Error('El logo tiene que ser una imagen PNG, JPG, WEBP, GIF o SVG.');
  if (logo.length > LOGO_MAX_CHARS) throw new Error('El logo es demasiado grande.');
  return { [MARCA_KEYS.nombre]: nombre, [MARCA_KEYS.color]: color.trim().toUpperCase(), [MARCA_KEYS.logo]: logo };
}

export function leerMarca(settings = {}) {
  const nombre = String(settings[MARCA_KEYS.nombre] || '').trim() || MARCA_DEFAULT.nombre;
  const color  = esColor(settings[MARCA_KEYS.color]) ? settings[MARCA_KEYS.color].trim().toUpperCase() : MARCA_DEFAULT.color;
  const logo   = LOGO_RE.test(settings[MARCA_KEYS.logo] || '') ? settings[MARCA_KEYS.logo] : '';
  return { nombre, color, logo };
}

const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = rgb => '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
// t > 0 aclara hacia blanco, t < 0 oscurece hacia negro.
const mezclar = (rgb, t) => rgb.map(v => t >= 0 ? v + (255 - v) * t : v * (1 + t));

// Luminancia relativa (WCAG) y contraste entre dos colores.
function luminancia(rgb) {
  const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
  const [la, lb] = [luminancia(hexToRgb(a)), luminancia(hexToRgb(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Colores que usa la pantalla a partir del color principal:
// - header / headerInk: barra superior y su texto: blanco salvo que no llegue a contraste 3
//   (texto grande/negrita y botones, WCAG); tambien es el texto de los botones con fondo de color
// - accent / accentInk: botones y textos destacados en tema claro (accentInk mas oscuro para texto)
// - accentDark / accentInkDark: lo mismo en tema oscuro (mas claros para que se lean sobre negro)
export function paleta(color) {
  const base = esColor(color) ? color.toUpperCase() : MARCA_DEFAULT.color;
  const rgb = hexToRgb(base);
  const headerInk = contraste(base, '#FFFFFF') >= 3 ? '#FFFFFF' : '#1A1A1A';
  // Texto de acento legible sobre fondo claro: se oscurece hasta llegar a contraste 4.5.
  let ink = rgb, t = 0;
  while (contraste(rgbToHex(ink), '#FFFFFF') < 4.5 && t > -0.9) { t -= 0.05; ink = mezclar(rgb, t); }
  // Y sobre fondo oscuro: se aclara.
  let inkDk = rgb; t = 0;
  while (contraste(rgbToHex(inkDk), '#0D0D0D') < 4.5 && t < 0.9) { t += 0.05; inkDk = mezclar(rgb, t); }
  const accentDark = rgbToHex(mezclar(rgb, 0.08));
  return {
    header: base, headerInk, headerFg: headerInk === '#FFFFFF' ? '255,255,255' : '26,26,26',
    accent: base, accentRgb: rgb.join(','), accentInk: rgbToHex(ink),
    accentDark, accentDarkRgb: hexToRgb(accentDark).join(','), accentInkDark: rgbToHex(inkDk),
  };
}
