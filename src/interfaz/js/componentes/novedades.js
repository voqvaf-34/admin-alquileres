// Visor: cuantos alquileres, propietarios y administraciones nuevos hay desde la ultima vez que
// se entro a cada pestaña (circulito naranja). Al entrar a la pestaña se dan por vistos.
// Lo visto se guarda en este equipo; la primera vez que se abre el Visor todo cuenta como visto.
import { estado } from '../nucleo/estado.js';
import { pintarAviso } from './avisos.js';

const CLAVE = 'alq-visor-visto';
const PESTANAS = {
  basedatos:        () => estado.entradas,
  propietarios:     () => estado.propietarios,
  administraciones: () => estado.administraciones,
};

const esVisor = () => document.body.classList.contains('visor');
const idsDe = pestana => (PESTANAS[pestana]() || []).map(x => x.id);

// Lo visto: se lee del equipo una sola vez y se guarda solo cuando cambia (no en cada repintado).
let vistos = null;   // pestaña -> Set de ids
function leerVistos() {
  if (!vistos) {
    let guardado = {};
    try { guardado = JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (_) { /* sin datos: todo nuevo */ }
    vistos = {};
    for (const p of Object.keys(PESTANAS)) if (Array.isArray(guardado[p])) vistos[p] = new Set(guardado[p]);
  }
  return vistos;
}
function guardarVistos() {
  const datos = {};
  for (const p of Object.keys(vistos)) datos[p] = [...vistos[p]];
  try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (_) { /* sin almacenamiento: solo no recuerda */ }
}

// Lo que era nuevo al entrar a la pestaña: se muestra arriba de todo con un punto naranja mientras
// se siga en esa pestaña; al pasar a otra, vuelve a ser un registro normal.
const destacados = {};   // pestaña -> Set de ids

// Entrar a una pestaña: todo lo que hay en ella queda visto (y lo nuevo, destacado mientras tanto).
export function marcarVisto(pestana) {
  if (!esVisor()) return;
  for (const p of Object.keys(destacados)) if (p !== pestana) delete destacados[p];
  if (!PESTANAS[pestana]) return;
  const v = leerVistos();
  const actuales = idsDe(pestana);
  if (!v[pestana]) { v[pestana] = new Set(actuales); guardarVistos(); return; }   // primera vez
  const nuevos = actuales.filter(id => !v[pestana].has(id));
  if (!nuevos.length) return;
  destacados[pestana] = new Set([...(destacados[pestana] || []), ...nuevos]);
  v[pestana] = new Set(actuales);
  guardarVistos();
}

export const esNuevo = (pestana, id) => !!(destacados[pestana] && destacados[pestana].has(id));

// Los nuevos primero (el resto mantiene su orden).
export function nuevosPrimero(pestana, lista) {
  if (!destacados[pestana]) return lista;
  return [...lista.filter(x => esNuevo(pestana, x.id)), ...lista.filter(x => !esNuevo(pestana, x.id))];
}

export const puntoNuevo = (pestana, id) => esNuevo(pestana, id) ? '<span class="punto-nuevo" title="Nuevo"></span>' : '';

export function pintarNovedades() {
  if (!esVisor()) return;
  // La pestaña en pantalla ya se esta viendo: al abrir el Visor o al llegar datos nuevos estando en ella.
  marcarVisto(estado.pestanaActiva);
  const v = leerVistos();
  let primeraVez = false;
  for (const pestana of Object.keys(PESTANAS)) {
    const actuales = idsDe(pestana);
    if (!v[pestana]) { v[pestana] = new Set(actuales); primeraVez = true; }
    pintarAviso('pestana-' + pestana, actuales.filter(id => !v[pestana].has(id)).length, 'nuevo');
  }
  if (primeraVez) guardarVistos();
}
