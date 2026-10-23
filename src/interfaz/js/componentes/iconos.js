// Icono de la app: prediseñado (un dibujo sobre un color), generado del logo o imagen propia.
// Se dibuja en un canvas y se manda como PNG al proceso principal.
import { paleta } from '../../../dominios/index.js';

// Dibujos en coordenadas 0..1 (el canvas ya esta escalado); "tinta" es el color del dibujo y
// "fondo" el del cuadrado (para "recortar" ventanas y puertas).
const DIBUJOS = {
  edificio(g, tinta, fondo) {
    g.fillStyle = tinta; g.fillRect(0.33, 0.22, 0.34, 0.58);
    g.fillStyle = fondo;
    for (let c = 0; c < 3; c++) for (let f = 0; f < 4; f++) g.fillRect(0.385 + c * 0.09, 0.29 + f * 0.085, 0.05, 0.045);
    g.fillRect(0.45, 0.66, 0.10, 0.14);
  },
  edificios(g, tinta, fondo) {
    g.fillStyle = tinta; g.fillRect(0.22, 0.36, 0.26, 0.44); g.fillRect(0.52, 0.2, 0.26, 0.6);
    g.fillStyle = fondo;
    for (let f = 0; f < 4; f++) for (let c = 0; c < 2; c++) g.fillRect(0.27 + c * 0.1, 0.42 + f * 0.085, 0.05, 0.045);
    for (let f = 0; f < 6; f++) for (let c = 0; c < 2; c++) g.fillRect(0.57 + c * 0.1, 0.26 + f * 0.085, 0.05, 0.045);
  },
  casa(g, tinta, fondo) {
    g.fillStyle = tinta;
    g.beginPath(); g.moveTo(0.5, 0.2); g.lineTo(0.82, 0.48); g.lineTo(0.18, 0.48); g.closePath(); g.fill();
    g.fillRect(0.26, 0.46, 0.48, 0.34);
    g.fillStyle = fondo; g.fillRect(0.44, 0.58, 0.12, 0.22); g.fillRect(0.31, 0.53, 0.09, 0.09); g.fillRect(0.6, 0.53, 0.09, 0.09);
  },
  llave(g, tinta) {
    g.strokeStyle = tinta; g.fillStyle = tinta; g.lineWidth = 0.075; g.lineCap = 'round';
    g.beginPath(); g.arc(0.34, 0.5, 0.13, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0.47, 0.5); g.lineTo(0.8, 0.5); g.stroke();
    g.fillRect(0.62, 0.5, 0.06, 0.13); g.fillRect(0.72, 0.5, 0.06, 0.1);
  },
  ubicacion(g, tinta, fondo) {
    g.fillStyle = tinta;
    g.beginPath(); g.arc(0.5, 0.42, 0.21, Math.PI, 0); g.quadraticCurveTo(0.71, 0.58, 0.5, 0.82);
    g.quadraticCurveTo(0.29, 0.58, 0.29, 0.42); g.fill();
    g.fillStyle = fondo; g.beginPath(); g.arc(0.5, 0.42, 0.08, 0, Math.PI * 2); g.fill();
  },
  inicial(g, tinta, _fondo, nombre) {
    const letra = (String(nombre || '').trim()[0] || 'A').toUpperCase();
    g.fillStyle = tinta; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 0.56px ${getComputedStyle(document.documentElement).getPropertyValue('--fuente') || 'sans-serif'}`;
    g.fillText(letra, 0.5, 0.53);
  },
};

const cargarImagen = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  img.src = src;
});

function cuadrado(lado, color) {
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  const g = c.getContext('2d');
  g.beginPath(); g.roundRect(0, 0, lado, lado, lado * 0.2);
  g.fillStyle = color; g.fill();
  return { c, g };
}

// Imagen centrada y achicada dentro del cuadrado (con margen).
async function conImagen(src, lado, fondo, margen) {
  const img = await cargarImagen(src);
  const { c, g } = fondo ? cuadrado(lado, fondo) : (() => { const c = document.createElement('canvas'); c.width = c.height = lado; return { c, g: c.getContext('2d') }; })();
  const m = lado * margen, max = lado - 2 * m, k = Math.min(max / img.width, max / img.height);
  g.drawImage(img, (lado - img.width * k) / 2, (lado - img.height * k) / 2, img.width * k, img.height * k);
  return c.toDataURL('image/png');
}

// marca: lo que devuelve leerMarca. Devuelve un data URL PNG de lado x lado.
export async function dibujarIcono(marca, lado = 256) {
  const { icono } = marca;
  if (icono.tipo === 'imagen' && icono.imagen) return conImagen(icono.imagen, lado, null, 0);
  if (icono.tipo === 'logo' && marca.logo) return conImagen(marca.logo, lado, marca.color, 0.12);
  const fondo = icono.color || marca.color;
  const { c, g } = cuadrado(lado, fondo);
  g.save(); g.scale(lado, lado);
  (DIBUJOS[icono.diseno] || DIBUJOS.edificio)(g, paleta(fondo).headerInk, fondo, marca.nombre);
  g.restore();
  return c.toDataURL('image/png');
}

// Imagen propia: se recorta a cuadrado (centro) y se guarda a 256 px.
export async function imagenCuadrada(src, lado = 256) {
  const img = await cargarImagen(src);
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  const s = Math.min(img.width, img.height);
  c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, lado, lado);
  return c.toDataURL('image/png');
}
