// Marca de la inmobiliaria en pantalla: colores, tema, tipografia, nombre/logo de la barra,
// titulo e icono de la ventana.
import { FUENTES, leerMarca, paleta } from '../../../dominios/index.js';
import { claveIcono, dibujarIcono } from './iconos.js';

const CACHE = 'alq-marca';   // tema.js la aplica antes del primer pintado (evita el destello de otro color)

// Variables CSS (--m-*) que usa estilos.css a partir de la paleta.
function variablesCss(p, fuente) {
  return {
    '--m-cabecera': p.cabecera, '--m-cabecera-tinta': p.tintaCabecera, '--m-cabecera-letra': p.cabeceraTexto,
    '--m-acento': p.acento, '--m-acento-rgb': p.acentoRgb, '--m-tinta': p.acentoTinta,
    '--m-acento-osc': p.acentoOscuro, '--m-acento-osc-rgb': p.acentoOscuroRgb, '--m-tinta-osc': p.acentoTintaOscuro,
    '--m-sec': p.sec, '--m-sec-rgb': p.secRgb, '--m-sec-sobre': p.secOn, '--m-sec-tinta': p.secTinta,
    '--m-sec-osc': p.secOscuro, '--m-sec-osc-rgb': p.secOscuroRgb, '--m-sec-tinta-osc': p.secTintaOscuro,
    '--m-tinte-fondo': p.tinteFondo, '--m-tinte-superficie': p.tinteSuperficie, '--m-tinte-fondo-osc': p.tinteFondoOscuro, '--m-tinte-panel-osc': p.tintePanelOscuro,
    '--fuente': FUENTES[fuente].css,
  };
}

// Pinta la marca en un elemento (la pagina entera o la vista previa de la configuracion).
export function pintarApariencia(el, marca) {
  for (const [k, v] of Object.entries(variablesCss(paleta(marca.color, marca.color2), marca.fuente))) el.style.setProperty(k, v);
  el.dataset.tema = marca.tema;
}

// Barra superior (y la de las pantallas de inicio): logo si hay, si no el nombre.
function pintarNombreYLogo({ nombre, logo }) {
  document.querySelectorAll('[data-marca-nombre]').forEach(el => { el.textContent = nombre; el.hidden = !!logo; });
  document.querySelectorAll('[data-marca-logo]').forEach(el => {
    if (logo) el.src = logo; else el.removeAttribute('src');
    el.hidden = !logo;
  });
  const hdr = document.getElementById('cab-logo');
  if (hdr) hdr.setAttribute('aria-label', nombre);
}

let ultimoColor = null, ultimoIcono = null;

export function aplicarMarca(ajustes) {
  const marca = leerMarca(ajustes);
  pintarApariencia(document.documentElement, marca);
  pintarNombreYLogo(marca);
  document.title = `${marca.nombre} · Alquileres${document.body.classList.contains('visor') ? ' · Visor' : ''}`;
  // La barra de titulo de Windows (botones minimizar/cerrar) y el icono los maneja el proceso principal.
  const p = paleta(marca.color, marca.color2);
  if (marca.color !== ultimoColor) {
    ultimoColor = marca.color;
    window.api.ponerColorBarraTitulo(p.cabecera, p.tintaCabecera).catch(() => {});
  }
  // Icono: se vuelve a dibujar solo si cambio algo que lo afecta.
  const clave = claveIcono(marca);
  if (clave !== ultimoIcono) {
    ultimoIcono = clave;
    dibujarIcono(marca).then(png => window.api.ponerIconoApp(png)).catch(() => {});
  }
  try {
    localStorage.setItem(CACHE, JSON.stringify({ vars: variablesCss(p, marca.fuente), tema: marca.tema, nombre: marca.nombre, logo: marca.logo }));
  } catch (_) {}
  return marca;
}
