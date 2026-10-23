// Marca y apariencia de la inmobiliaria: nombre, logo, colores, tema, tipografia e icono.
// Se guarda en la configuracion de la base (viaja al Visor con la copia publicada).

// color2 vacio = el mismo que el principal.
// icono: tipo 'app' (diseño prediseñado, color vacio = el principal), 'logo' (generado del logo) o
// 'imagen' (imagen cuadrada propia).
export const MARCA_DEFAULT = {
  nombre: 'Mi Inmobiliaria', color: '#2563EB', color2: '', logo: '', tema: 'clasico', fuente: 'rubik',
  icono: { tipo: 'app', diseno: 'edificio', color: '', imagen: '' },
};

// Claves en la tabla settings.
export const MARCA_KEYS = {
  nombre: 'marcaNombre', color: 'marcaColor', color2: 'marcaColor2', logo: 'marcaLogo',
  tema: 'marcaTema', fuente: 'marcaFuente',
  iconoTipo: 'marcaIconoTipo', iconoDiseno: 'marcaIconoDiseno', iconoColor: 'marcaIconoColor', iconoImagen: 'marcaIconoImagen',
};

// Diseños de icono prediseñados (se dibujan en componentes/iconos.js).
export const ICONOS_APP = {
  edificio: 'Edificio', edificios: 'Edificios', casa: 'Casa', llave: 'Llave', ubicacion: 'Ubicación', inicial: 'Inicial',
};
export const ICONO_TIPOS = ['app', 'logo', 'imagen'];

// Colores sugeridos en la configuracion.
export const COLORES_SUGERIDOS = ['#2563EB', '#0F766E', '#15803D', '#7C3AED', '#BE123C', '#EA580C', '#FD4108', '#334155'];

// Temas: fondos y superficies (los valores estan en estilos.css; "marca" se calcula del color).
// muestra / oscuro: [fondo, tarjeta] en modo claro y oscuro, para los botones de la configuracion.
export const TEMAS = {
  clasico:   { nombre: 'Clásico',        muestra: ['#F7F7F7', '#FFFFFF'], oscuro: ['#0D0D0D', '#161616'] },
  calido:    { nombre: 'Cálido',         muestra: ['#F5F0E8', '#FFFCF7'], oscuro: ['#14110D', '#1E1A15'] },
  pizarra:   { nombre: 'Pizarra',        muestra: ['#EDF1F6', '#FFFFFF'], oscuro: ['#0E131A', '#161D27'] },
  fresco:    { nombre: 'Fresco',         muestra: ['#EEF6F3', '#FFFFFF'], oscuro: ['#0B1411', '#121D19'] },
  marca:     { nombre: 'Con mi color',   muestra: null, oscuro: null },
  contraste: { nombre: 'Alto contraste', muestra: ['#FFFFFF', '#FFFFFF'], oscuro: ['#000000', '#0A0A0A'] },
};

// Tipografias empaquetadas con la app (ver scripts/fuentes.js) y la del sistema.
export const FUENTES = {
  rubik:      { nombre: 'Rubik',          css: "'Rubik', 'Segoe UI', sans-serif" },
  inter:      { nombre: 'Inter',          css: "'Inter', 'Segoe UI', sans-serif" },
  montserrat: { nombre: 'Montserrat',     css: "'Montserrat', 'Segoe UI', sans-serif" },
  nunito:     { nombre: 'Nunito',         css: "'Nunito', 'Segoe UI', sans-serif" },
  lora:       { nombre: 'Lora (serif)',   css: "'Lora', Georgia, serif" },
  sistema:    { nombre: 'La de Windows',  css: "'Segoe UI', Roboto, sans-serif" },
};

export const esColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim());

const LOGO_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const ICONO_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_CHARS = 600 * 1024;

// Valida lo que llega de la ventana de Configuracion y devuelve las claves a guardar.
// Nombre vacio = el de por defecto; logo vacio = sin logo; color2 vacio = igual al principal.
export function marcaASettings({ nombre = '', color = '', color2 = '', logo = '', tema = MARCA_DEFAULT.tema,
  fuente = MARCA_DEFAULT.fuente, icono = MARCA_DEFAULT.icono } = {}) {
  nombre = String(nombre).replace(/\s+/g, ' ').trim();
  if (nombre.length > 60) throw new Error('El nombre puede tener hasta 60 caracteres.');
  if (!esColor(color)) throw new Error('Color no valido (formato #RRGGBB).');
  if (color2 && !esColor(color2)) throw new Error('Color secundario no valido (formato #RRGGBB).');
  if (!TEMAS[tema]) throw new Error('Tema desconocido.');
  if (!FUENTES[fuente]) throw new Error('Tipografia desconocida.');
  logo = String(logo || '');
  if (logo && !LOGO_RE.test(logo)) throw new Error('El logo tiene que ser una imagen PNG, JPG, WEBP, GIF o SVG.');
  if (logo.length > LOGO_MAX_CHARS) throw new Error('El logo es demasiado grande.');
  const ic = { ...MARCA_DEFAULT.icono, ...(icono || {}) };
  if (!ICONO_TIPOS.includes(ic.tipo)) throw new Error('Tipo de icono desconocido.');
  if (!ICONOS_APP[ic.diseno]) throw new Error('Diseño de icono desconocido.');
  if (ic.color && !esColor(ic.color)) throw new Error('Color del icono no valido (formato #RRGGBB).');
  const imagen = String(ic.imagen || '');
  if (imagen && !ICONO_RE.test(imagen)) throw new Error('La imagen del icono tiene que ser PNG.');
  if (imagen.length > LOGO_MAX_CHARS) throw new Error('La imagen del icono es demasiado grande.');
  if (ic.tipo === 'logo' && !logo) throw new Error('Para usar el logo como icono hay que cargar un logo.');
  if (ic.tipo === 'imagen' && !imagen) throw new Error('Falta elegir la imagen del icono.');
  const c1 = color.trim().toUpperCase(), c2 = color2 ? color2.trim().toUpperCase() : '';
  return {
    [MARCA_KEYS.nombre]: nombre, [MARCA_KEYS.color]: c1, [MARCA_KEYS.color2]: c2 === c1 ? '' : c2,
    [MARCA_KEYS.logo]: logo, [MARCA_KEYS.tema]: tema, [MARCA_KEYS.fuente]: fuente,
    [MARCA_KEYS.iconoTipo]: ic.tipo, [MARCA_KEYS.iconoDiseno]: ic.diseno,
    [MARCA_KEYS.iconoColor]: ic.color ? ic.color.trim().toUpperCase() : '', [MARCA_KEYS.iconoImagen]: imagen,
  };
}

export function leerMarca(settings = {}) {
  const k = MARCA_KEYS;
  const nombre = String(settings[k.nombre] || '').trim() || MARCA_DEFAULT.nombre;
  const color  = esColor(settings[k.color]) ? settings[k.color].trim().toUpperCase() : MARCA_DEFAULT.color;
  const color2 = esColor(settings[k.color2]) ? settings[k.color2].trim().toUpperCase() : '';
  const logo   = LOGO_RE.test(settings[k.logo] || '') ? settings[k.logo] : '';
  const tema   = TEMAS[settings[k.tema]] ? settings[k.tema] : MARCA_DEFAULT.tema;
  const fuente = FUENTES[settings[k.fuente]] ? settings[k.fuente] : MARCA_DEFAULT.fuente;
  // Icono: si el elegido ya no se puede usar (logo o imagen borrados) vuelve al prediseñado.
  const imagen = ICONO_RE.test(settings[k.iconoImagen] || '') ? settings[k.iconoImagen] : '';
  let tipo = ICONO_TIPOS.includes(settings[k.iconoTipo]) ? settings[k.iconoTipo] : 'app';
  if ((tipo === 'logo' && !logo) || (tipo === 'imagen' && !imagen)) tipo = 'app';
  const icono = {
    tipo, imagen,
    diseno: ICONOS_APP[settings[k.iconoDiseno]] ? settings[k.iconoDiseno] : MARCA_DEFAULT.icono.diseno,
    color: esColor(settings[k.iconoColor]) ? settings[k.iconoColor].trim().toUpperCase() : '',
  };
  return { nombre, color, color2, logo, tema, fuente, icono };
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

// Version del color legible como texto sobre un fondo (contraste 4.5): se oscurece o se aclara.
function legibleSobre(rgb, fondo, hacia) {
  let c = rgb, t = 0;
  while (contraste(rgbToHex(c), fondo) < 4.5 && Math.abs(t) < 0.9) { t += hacia * 0.05; c = mezclar(rgb, t); }
  return c;
}

// Colores que usa la pantalla a partir del color principal (y el secundario, opcional):
// - header / headerInk: barra superior y su texto: blanco salvo que no llegue a contraste 3
//   (texto grande/negrita y botones, WCAG); tambien es el texto de los botones con fondo de color
// - accent / accentInk: botones y textos destacados en tema claro (accentInk mas oscuro para texto)
// - accentDark / accentInkDark: lo mismo en tema oscuro (mas claros para que se lean sobre negro)
// - sec*: lo mismo para el color secundario (pestaña activa, avisos, titulos de seccion)
// - tinte*: fondos del tema "Con mi color"
export function paleta(color, color2 = '') {
  const base = esColor(color) ? color.toUpperCase() : MARCA_DEFAULT.color;
  const sec  = esColor(color2) ? color2.toUpperCase() : base;
  const rgb = hexToRgb(base), rgb2 = hexToRgb(sec);
  const headerInk = contraste(base, '#FFFFFF') >= 3 ? '#FFFFFF' : '#1A1A1A';
  const secOn = contraste(sec, '#FFFFFF') >= 3 ? '#FFFFFF' : '#1A1A1A';
  const accentDark = rgbToHex(mezclar(rgb, 0.08)), secDark = rgbToHex(mezclar(rgb2, 0.08));
  return {
    header: base, headerInk, headerFg: headerInk === '#FFFFFF' ? '255,255,255' : '26,26,26',
    accent: base, accentRgb: rgb.join(','), accentInk: rgbToHex(legibleSobre(rgb, '#FFFFFF', -1)),
    accentDark, accentDarkRgb: hexToRgb(accentDark).join(','), accentInkDark: rgbToHex(legibleSobre(rgb, '#0D0D0D', 1)),
    sec, secRgb: rgb2.join(','), secOn, secInk: rgbToHex(legibleSobre(rgb2, '#FFFFFF', -1)),
    secDark, secDarkRgb: hexToRgb(secDark).join(','), secInkDark: rgbToHex(legibleSobre(rgb2, '#0D0D0D', 1)),
    tinteBg: rgbToHex(mezclar(rgb, 0.93)), tinteSurface: rgbToHex(mezclar(rgb, 0.985)),
    tinteBgDark: rgbToHex(mezclar(rgb, -0.9)), tintePanelDark: rgbToHex(mezclar(rgb, -0.84)),
  };
}
