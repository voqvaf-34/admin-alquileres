// Guardado de cambios (marcas, importes, comentarios) y consultas sobre los datos cargados.
import * as D from '../../../dominios/index.js';
import { call } from './api.js';
import { esc, mostrarAviso } from './dom.js';
import { estado, reemplazarEntrada } from './estado.js';
import { colorPorDias } from './formato.js';

export let _guardandoMarcas = Promise.resolve();

export function guardarMarcas() {
  const snapshot = JSON.parse(JSON.stringify(estado.marcas));
  _guardandoMarcas = _guardandoMarcas
    .then(() => call('guardarMarcas', snapshot))
    .catch(err => mostrarAviso('No se pudieron guardar las marcas: ' + esc(err.message), 'err'));
  return _guardandoMarcas;
}

// Aumento enviado: registra el mes del aumento y el nuevo importe.
export async function guardarAumento(entrada, nuevoMonto, fecha) {
  try {
    const primeroDelMes = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
    reemplazarEntrada(await call('modificarContrato', entrada.id, { importe: nuevoMonto, ultimoAumento: D.aFechaISO(primeroDelMes) }));
    mostrarAviso('&#10003; Aumento guardado', 'ok');
    return true;
  } catch (err) {
    mostrarAviso('Error al guardar el aumento: ' + esc(err.message), 'err');
    return false;
  }
}

export async function guardarNotas(entrada, texto, okMsg) {
  try {
    reemplazarEntrada(await call('modificarContrato', entrada.id, { notas: texto.trim() }));
    if (okMsg) mostrarAviso(okMsg, 'ok');
    return true;
  } catch (err) {
    mostrarAviso('Error al guardar el comentario: ' + esc(err.message), 'err');
    return false;
  }
}

export function agregarNota(entrada, txt) {
  const anterior = entrada.notas ? entrada.notas.trim() : '';
  return anterior ? anterior + ' | ' + txt : txt;
}

// La renovacion ya queda en las marcas (recuadro verde y linea de tiempo): a los comentarios
// solo va el comentario que se haya escrito al renovar.
export async function guardarRenovacion(entrada, anios, comentario) {
  if (comentario) return guardarNotas(entrada, agregarNota(entrada, comentario), '&#10003; Renovacion guardada');
  mostrarAviso('&#10003; Renovacion guardada', 'ok');
  return true;
}

// Ante direcciones repetidas (re-alquileres) se prioriza el contrato activo mas reciente.
export function entradaPorDireccion(dir) {
  if (!estado.entradas) return null;
  const coincidencias = estado.entradas.filter(e => e.direccion === dir);
  if (!coincidencias.length) return null;
  const candidatos = coincidencias.some(e => !e.inactivo) ? coincidencias.filter(e => !e.inactivo) : coincidencias;
  return candidatos.reduce((a, b) => (b.id > a.id ? b : a));
}

export const obtenerAumentos          = (lista, m, y) => D.obtenerAumentos(lista, m, y, estado.marcas);

export const obtenerFechaVenc          = e => D.obtenerFechaVenc(e, estado.marcas);

export const obtenerVencimientos      = (lista, m, y) => D.obtenerVencimientos(lista, m, y, estado.marcas);

export const obtenerVencidosAtrasados = (lista, m, y) => D.obtenerVencidosAtrasados(lista, m, y, estado.marcas);

export const esAumentoResuelto = (e, m, y) => D.esAumentoResuelto(e, m, y, estado.marcas);

export const esVencResuelto    = e => D.esVencResuelto(e, estado.marcas);

export const mensajeRenovacionVenc = e => D.mensajeRenovacion(obtenerFechaVenc(e), { ajustes: estado.ajustesApp, contrato: e });

// Amarillo si faltan mas de 10 dias para el vencimiento; rojo si faltan 10 o menos (o ya vencio).
export function colorVenc(e) { return colorPorDias(obtenerFechaVenc(e)); }
