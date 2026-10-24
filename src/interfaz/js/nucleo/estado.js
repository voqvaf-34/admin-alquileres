// Estado compartido de la interfaz: datos cargados, filtros y pestaña activa.
import * as D from '../../../dominios/index.js';

export const estado = {
  entradas: null,            // alquileres cargados (hidratados)
  administraciones: null,
  propietarios: [], contactos: [], contratosPropietarios: [], docsPropietarios: [], cuentasPropietarios: [],
  marcas: {},                // aumento enviado, renovado, no renueva... (por direccion)
  ajustesApp: {},
  ipc: 3.16,
  mesElegido: new Date().getMonth() + 1,
  anioElegido: new Date().getFullYear(),
  pestanaActiva: 'basedatos',
  opMostrarSinResolver: false, opMostrarResuelto: false,
  baseTextoBusqueda: '', baseFiltroAnio: 0, baseFiltroMes: 0, baseMostrarActivos: true, baseMostrarInactivos: false,
  filasAbiertas: new Set(),  // filas abiertas en la Base de Datos
};

// Recibe {owners, contacts, contractOwners} (completos o parciales) y re-vincula los contratos.
export function aplicarPropietarios(st) {
  if (st.propietarios)         estado.propietarios = st.propietarios;
  if (st.contactos)       estado.contactos = st.contactos;
  if (st.contratosPropietarios) estado.contratosPropietarios = st.contratosPropietarios;
  if (st.docsPropietarios)      estado.docsPropietarios = st.docsPropietarios;
  if (st.cuentasPropietarios)  estado.cuentasPropietarios = st.cuentasPropietarios;
  if (estado.entradas) D.adjuntarPropietarios(estado.entradas, estado.propietarios, estado.contactos, estado.contratosPropietarios);
}

export function reemplazarEntrada(textoOriginal) {
  const h = D.hidratarContrato(textoOriginal);
  const i = estado.entradas.findIndex(e => e.id === h.id);
  if (i >= 0) estado.entradas[i] = h; else estado.entradas.push(h);
  D.adjuntarPropietarios([h], estado.propietarios, estado.contactos, estado.contratosPropietarios);
  return h;
}
