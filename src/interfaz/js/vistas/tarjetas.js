// Lo comun a las pestañas Aumentos y Renovaciones: acciones a medio cargar, filtro de
// resueltos y los datos de inquilino/propietario de cada tarjeta.
import { estado } from '../nucleo/estado.js';
import { formatearMails, formatearNombres, enlaceTelefono } from '../nucleo/formato.js';
import { filaContacto } from './propietarios.js';

// Acciones que esperan un dato antes de confirmarse (fecha de renovacion, descripcion de
// "no aumenta" / "no renueva"). Solo una a la vez: empezar una descarta las otras.
export const pendientes = {
  venc: null,       // direccion (o 'R:' + direccion para el ciclo post-renovacion)
  noAumenta: null,  // clave de marca "na|..."
  noRenueva: null,  // direccion
};

// Al deshacer/rehacer se descartan las acciones a medio cargar.
export function limpiarPendientes() { pendientes.venc = pendientes.noAumenta = pendientes.noRenueva = null; }

// Mes siguiente al elegido (para la seccion "Proximo").
export function mesSiguiente(m, y) { return m === 12 ? { m: 1, y: y + 1 } : { m: m + 1, y }; }

// Filtros "Sin resolver" / "Resueltos": ninguno tildado = se ven los dos.
export function filtroResueltos() {
  const todos = !estado.opShowSinResolver && !estado.opShowResuelto;
  return {
    pendientes: estado.opShowSinResolver || todos,
    resueltos: estado.opShowResuelto || todos,
    palabra: estado.opShowSinResolver ? 'pendientes' : estado.opShowResuelto ? 'resueltos' : '',
  };
}

// Inquilino y propietario con sus telefonos y contactos (y el mail del inquilino si se pide).
export function datosPersonas(e, { conMail = false } = {}) {
  return `<div class="card-grid">
        <div><span class="lbl">Inq: </span>${formatearNombres(e.inquilino)}</div>
        <div><span class="lbl">Prop: </span>${formatearNombres(e.propietario)}</div>
        <div><span class="lbl">Tel: </span>${enlaceTelefono(e.telInq)}</div>
        <div><span class="lbl">Tel: </span>${enlaceTelefono(e.telProp)}</div>
        ${filaContacto(e, 'full')}
        ${conMail && e.mailInq ? `<div class="full"><span class="lbl">Mail: </span>${formatearMails(e.mailInq)}</div>` : ''}
      </div>`;
}
