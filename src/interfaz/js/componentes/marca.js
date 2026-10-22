// Marca de la inmobiliaria en pantalla: colores, nombre/logo de la barra y titulo de la ventana.
import { leerMarca, paleta } from '../../../dominios/index.js';

const CACHE = 'alq-marca';   // tema.js la aplica antes del primer pintado (evita el destello de otro color)

// Variables CSS (--m-*) que usa estilos.css a partir de la paleta.
export function variablesCss(p) {
  return {
    '--m-header': p.header, '--m-header-ink': p.headerInk, '--m-header-fg': p.headerFg,
    '--m-accent': p.accent, '--m-accent-rgb': p.accentRgb, '--m-ink': p.accentInk,
    '--m-accent-dk': p.accentDark, '--m-accent-dk-rgb': p.accentDarkRgb, '--m-ink-dk': p.accentInkDark,
  };
}

export function pintarVariables(el, color) {
  for (const [k, v] of Object.entries(variablesCss(paleta(color)))) el.style.setProperty(k, v);
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

let ultimoColor = null;

export function aplicarMarca(settings) {
  const marca = leerMarca(settings);
  pintarVariables(document.documentElement, marca.color);
  pintarNombreYLogo(marca);
  document.title = `${marca.nombre} · Alquileres${document.body.classList.contains('viewer') ? ' · Visor' : ''}`;
  // La barra de titulo de Windows (botones minimizar/cerrar) la dibuja el proceso principal.
  if (marca.color !== ultimoColor) {
    ultimoColor = marca.color;
    const p = paleta(marca.color);
    window.api.setTitleBarColor(p.header, p.headerInk).catch(() => {});
  }
  try { localStorage.setItem(CACHE, JSON.stringify({ vars: variablesCss(paleta(marca.color)), nombre: marca.nombre, logo: marca.logo })); } catch (_) {}
  return marca;
}
