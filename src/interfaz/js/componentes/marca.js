// Marca de la inmobiliaria en pantalla: colores, tema, tipografia, nombre/logo de la barra,
// titulo e icono de la ventana.
import { FUENTES, leerMarca, paleta } from '../../../dominios/index.js';
import { dibujarIcono } from './iconos.js';

const CACHE = 'alq-marca';   // tema.js la aplica antes del primer pintado (evita el destello de otro color)

// Variables CSS (--m-*) que usa estilos.css a partir de la paleta.
export function variablesCss(p, fuente) {
  return {
    '--m-header': p.header, '--m-header-ink': p.headerInk, '--m-header-fg': p.headerFg,
    '--m-accent': p.accent, '--m-accent-rgb': p.accentRgb, '--m-ink': p.accentInk,
    '--m-accent-dk': p.accentDark, '--m-accent-dk-rgb': p.accentDarkRgb, '--m-ink-dk': p.accentInkDark,
    '--m-sec': p.sec, '--m-sec-rgb': p.secRgb, '--m-sec-on': p.secOn, '--m-sec-ink': p.secInk,
    '--m-sec-dk': p.secDark, '--m-sec-dk-rgb': p.secDarkRgb, '--m-sec-ink-dk': p.secInkDark,
    '--m-tinte-bg': p.tinteBg, '--m-tinte-surface': p.tinteSurface, '--m-tinte-bg-dk': p.tinteBgDark, '--m-tinte-panel-dk': p.tintePanelDark,
    '--fuente': FUENTES[fuente].css,
  };
}

// Pinta la marca en un elemento (la pagina entera o la vista previa de la configuracion).
export function pintarApariencia(el, marca) {
  for (const [k, v] of Object.entries(variablesCss(paleta(marca.color, marca.color2), marca.fuente))) el.style.setProperty(k, v);
  el.dataset.tema = marca.tema;
}

// Barra superior (y la de las pantallas de inicio): logo si hay, si no el nombre.
export function pintarNombreYLogo({ nombre, logo }) {
  document.querySelectorAll('[data-marca-nombre]').forEach(el => { el.textContent = nombre; el.hidden = !!logo; });
  document.querySelectorAll('[data-marca-logo]').forEach(el => {
    if (logo) el.src = logo; else el.removeAttribute('src');
    el.hidden = !logo;
  });
  const hdr = document.getElementById('hdr-logo');
  if (hdr) hdr.setAttribute('aria-label', nombre);
}

let ultimoColor = null, ultimoIcono = null;

export function aplicarMarca(settings) {
  const marca = leerMarca(settings);
  pintarApariencia(document.documentElement, marca);
  pintarNombreYLogo(marca);
  document.title = `${marca.nombre} · Alquileres${document.body.classList.contains('viewer') ? ' · Visor' : ''}`;
  // La barra de titulo de Windows (botones minimizar/cerrar) y el icono los maneja el proceso principal.
  const p = paleta(marca.color, marca.color2);
  if (marca.color !== ultimoColor) {
    ultimoColor = marca.color;
    window.api.setTitleBarColor(p.header, p.headerInk).catch(() => {});
  }
  // Icono: se vuelve a dibujar solo si cambio algo que lo afecta.
  const clave = JSON.stringify([marca.icono, marca.icono.tipo === 'logo' ? marca.logo : '', marca.color, marca.nombre[0], marca.fuente]);
  if (clave !== ultimoIcono) {
    ultimoIcono = clave;
    dibujarIcono(marca).then(png => window.api.setAppIcon(png)).catch(() => {});
  }
  try {
    localStorage.setItem(CACHE, JSON.stringify({ vars: variablesCss(p, marca.fuente), tema: marca.tema, nombre: marca.nombre, logo: marca.logo }));
  } catch (_) {}
  return marca;
}
