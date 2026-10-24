// Pestaña Aumentos: que alquileres aumentan en el mes, tarjetas y acciones (enviado, no aumenta).
import * as D from '../../../dominios/index.js';
import { claveAumento, formatearFecha, claveNoAumenta } from '../../../dominios/index.js';
import { dibujar } from '../app.js';
import { call } from '../nucleo/api.js';
import { agregarNota, entradaPorDireccion, obtenerAumentos, esAumentoResuelto, guardarAumento, guardarMarcas, guardarNotas } from '../nucleo/datos.js';
import { copiarAlPortapapeles, esc, mostrarAviso } from '../nucleo/dom.js';
import { estado, reemplazarEntrada } from '../nucleo/estado.js';
import { NOMBRES_MESES, formatearIPC, formatearDinero, formatearNombres, formatearNotas } from '../nucleo/formato.js';
import { datosPersonas, filtroResueltos, mesSiguiente, pendientes } from './tarjetas.js';

// Aumentos resueltos (enviado / no aumenta): una linea con el resumen; al tocarla se despliega
// el detalle con la opcion de deshacer (asi un clic de mas no deshace nada).
const aumAbiertos = new Set();   // claves de marca de las tarjetas resueltas desplegadas

function tarjetaAumentoCompacta(e, m, y) {
  const clave  = claveAumento(e, m, y);
  const mk   = estado.marcas[clave];
  const naKy = claveNoAumenta(e, m, y);
  const naMk = estado.marcas[naKy];
  if (!mk && !naMk) return '';
  const k = mk ? clave : naKy;
  const abierto = aumAbiertos.has(k);
  const resumen = mk
    ? `&#10003; Enviado ${mk.fecha}${mk.importeAnterior ? ` &middot; ${formatearDinero(mk.importeAnterior, e.moneda)} &rarr; ${formatearDinero(mk.importeNuevo, e.moneda)}` : ''}`
    : `&#10005; No aumenta${naMk.descripcion ? ' &mdash; ' + esc(naMk.descripcion) : ''} &middot; ${naMk.fecha}`;
  const datos = mk
    ? `<div><span class="lbl">Alquiler: </span>${mk.importeAnterior
          ? `${formatearDinero(mk.importeAnterior, e.moneda)} &rarr; <strong>${formatearDinero(mk.importeNuevo, e.moneda)}</strong>`
          : formatearDinero(e.importe, e.moneda)}</div>
       <div><span class="lbl">IPC aplicado: </span>${mk.ipc != null && mk.ipc !== '' ? formatearIPC(+mk.ipc) : '-'}</div>
       <div><span class="lbl">Enviado: </span>${mk.fecha}</div>`
    : `<div class="completo"><span class="lbl">Motivo: </span>${naMk.descripcion ? esc(naMk.descripcion) : '-'}</div>
       <div><span class="lbl">Marcado: </span>${naMk.fecha}</div>`;
  const detalle = !abierto ? '' : `
      <div class="tarjeta-grilla">
        <div><span class="lbl">Inq: </span>${formatearNombres(e.inquilino)}</div>
        <div><span class="lbl">Prop: </span>${formatearNombres(e.propietario)}</div>
        ${datos}
      </div>
      <div class="tarjeta-pie">
        <button class="marcar-btn" ${mk ? `data-aum-deshacer="${esc(clave)}"` : `data-des-na="${esc(naKy)}"`}>&#8617; Deshacer${mk ? ' enviado' : ''}</button>
      </div>`;
  return `<div class="tarjeta tarjeta-compacta${abierto ? ' abierta' : ''}" style="border-left:3px solid ${mk ? 'var(--verde)' : 'rgba(150,150,150,0.3)'}">
      <div class="tarjeta-compacta-fila aum-alternar" data-aum-alternar="${esc(k)}" title="${abierto ? 'Cerrar' : 'Ver el detalle'}">
        <span class="titulo-compacto">${esc(e.direccion)}</span>
        <span class="meta-chica">${resumen}</span>
        <span class="aum-flecha">${abierto ? '&#9660;' : '&#9658;'}</span>
      </div>${detalle}
    </div>`;
}

function pieAumento(e, m, y, ipcVal) {
  const nuevo    = D.nuevoImporte(e.importe, ipcVal);
  const clave      = claveAumento(e, m, y);
  const naKy     = claveNoAumenta(e, m, y);
  const mk       = estado.marcas[clave];
  const naMk     = estado.marcas[naKy];
  const ipcStr   = formatearIPC(ipcVal);
  const nuevoStr = formatearDinero(nuevo, e.moneda);

  if (D.gestionadoPor(e)) {
    return `<div class="tarjeta-pie">
      <span class="delegado-insignia">Delegado &rarr; ${esc(D.gestionadoPor(e))}</span>
      <span style="font-size:11px;color:var(--tenue)">Excluido de cola personal</span>
    </div>`;
  }

  const { inquilino: msgInq, propietario: msgProp } = D.mensajesAumento({ ajustes: estado.ajustesApp, contrato: e, porcentaje: ipcStr, nuevoImporte: nuevoStr });

  const btnsCopiar = `
    <button class="copiar-btn" data-copiar="${esc(msgInq)}"  title="Copiar mensaje inquilino">&#8663; Inq</button>
    <button class="copiar-btn" data-copiar="${esc(msgProp)}" title="Copiar mensaje propietario">&#8663; Prop</button>`;

  // Ya enviado
  if (mk) {
    return `<div class="tarjeta-pie">
      <label class="chk-caja listo">
        <input type="checkbox" class="chk" data-aum="${esc(clave)}" checked>
        Enviado ${mk.fecha}
      </label>
      ${mk.importeAnterior ? `<span class="cambio-etiqueta">${formatearDinero(mk.importeAnterior, e.moneda)} &rarr; ${formatearDinero(mk.importeNuevo, e.moneda)}</span>` : ''}
      ${btnsCopiar}
    </div>`;
  }

  // Marcado como "no aumenta"
  if (naMk) {
    return `<div class="tarjeta-pie">
      <span style="font-size:12px;color:var(--tenue)">&#10005; No aumenta${naMk.descripcion ? ' &mdash; ' + esc(naMk.descripcion) : ''} <span style="font-size:10px;color:var(--tenue)">${naMk.fecha}</span></span>
      <button class="desmarcar-btn" data-des-na="${esc(naKy)}" title="Deshacer" style="font-size:14px">&#8617;</button>
    </div>`;
  }

  // Esperando descripcion de "no aumenta"
  if (pendientes.noAumenta === naKy) {
    return `<div class="tarjeta-pie" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="inp-na-desc" placeholder="Descripcion (opcional, se guarda en comentarios)" class="fecha-campo" style="flex:1;min-width:160px">
      <button class="marcar-btn" data-na-conf="${esc(naKy)}">&#10003; Confirmar</button>
      <button class="marcar-btn" data-na-cancelar style="color:var(--tenue)">&#10005;</button>
    </div>`;
  }

  // Estado normal
  return `<div class="tarjeta-pie">
    <label class="chk-caja">
      <input type="checkbox" class="chk" data-aum="${esc(clave)}">
      Marcar enviado
    </label>
    <button class="marcar-btn" data-na-inicio="${esc(naKy)}" style="font-size:11px;border-color:rgba(var(--rojo-rgb),0.35);color:var(--rojo)">&#10005; No aumenta</button>
    ${btnsCopiar}
  </div>`;
}

function tarjetaAumento(e, m, y, ipcVal) {
  const nuevo  = D.nuevoImporte(e.importe, ipcVal);
  const diferencia   = nuevo - e.importe;
  const anios  = y - e.fechaInicio.getFullYear();
  const claveTarjeta = claveAumento(e, m, y);
  const mk     = estado.marcas[claveTarjeta];
  const naMk   = estado.marcas[claveNoAumenta(e, m, y)];
  const esBorrar  = Boolean(D.gestionadoPor(e));
  const colorBorde = mk ? 'var(--verde)' : naMk ? 'rgba(150,150,150,0.3)' : esBorrar ? 'var(--ambar)' : D.comentarios(e).length ? 'var(--naranja)' : 'rgba(var(--acento-rgb),0.3)';
  return `
    <div class="tarjeta" data-tarjeta-clave="${esc(claveTarjeta)}" style="border-left:3px solid ${colorBorde}${naMk ? ';filter:grayscale(1)' : ''}">
      <div class="tarjeta-arriba">
        <div>
          <span style="color:${esBorrar ? 'var(--ambar)' : 'var(--acento-tinta)'};font-weight:600">${esc(e.direccion)}</span>
          <span style="color:var(--tenue);margin-left:10px;font-size:11px">${anios}a</span>
          ${esBorrar ? `<span class="delegado-insignia" style="margin-left:8px">&#8618; ${esc(D.gestionadoPor(e))}</span>` : ''}
        </div>
        <div style="text-align:right;white-space:nowrap">
          <span style="color:var(--tenue)">${formatearDinero(e.importe, e.moneda)}</span>
          <span style="margin:0 6px;color:var(--tenue)">&rarr;</span>
          <span style="color:var(--verde);font-weight:600">${formatearDinero(nuevo, e.moneda)}</span>
          <span style="font-size:11px;color:var(--tenue);margin-left:6px">(+${formatearDinero(diferencia, e.moneda)})</span>
        </div>
      </div>
      ${datosPersonas(e, { conMail: true })}
      <div class="tarjeta-meta">Inicio: ${formatearFecha(e.fechaInicio)}${e.ultimoAumento ? ` &middot; Ultimo aumento: ${formatearFecha(e.ultimoAumento)}` : ''} &middot; Contrato: ${esc(e.contratoTexto||'-')}</div>
      ${formatearNotas(e)}
      ${pieAumento(e, m, y, ipcVal)}
    </div>`;
}

// Aumentos del mes elegido que faltan resolver (el circulito de la pestaña).
export function contarPendientesAumentos() {
  return obtenerAumentos(estado.entradas, estado.mesElegido, estado.anioElegido)
    .filter(e => !esAumentoResuelto(e, estado.mesElegido, estado.anioElegido)).length;
}

// Lista del mes elegido y del siguiente, con el filtro de resueltos.
export function dibujarAumentos(contenido) {
  const { m: nxM, y: nxY } = mesSiguiente(estado.mesElegido, estado.anioElegido);
  const aumentos     = obtenerAumentos(estado.entradas, estado.mesElegido, estado.anioElegido);
  const aumentosProx = obtenerAumentos(estado.entradas, nxM, nxY);
  const filtro = filtroResueltos();
  const mostrarPend = filtro.pendientes, mostrarResv = filtro.resueltos;
  const aumPend  = aumentos.filter(e => !esAumentoResuelto(e, estado.mesElegido, estado.anioElegido));
  const aumResv  = aumentos.filter(e =>  esAumentoResuelto(e, estado.mesElegido, estado.anioElegido));
  const proxPend = aumentosProx.filter(e => !esAumentoResuelto(e, nxM, nxY));
  const proxResv = aumentosProx.filter(e =>  esAumentoResuelto(e, nxM, nxY));

  let h = `<div class="sec-titulo">${NOMBRES_MESES[estado.mesElegido]} ${estado.anioElegido}</div>`;
  const visibleAum  = (mostrarPend ? aumPend  : []).concat(mostrarResv ? aumResv  : []);
  const visibleProx = (mostrarPend ? proxPend : []).concat(mostrarResv ? proxResv : []);
  if (visibleAum.length === 0) {
    h += `<div class="vacio">Sin aumentos ${filtro.palabra} este mes</div>`;
  } else {
    if (mostrarPend && aumPend.length)  h += `<div class="tarjeta-lista">${aumPend.map(e=>tarjetaAumento(e,estado.mesElegido,estado.anioElegido,estado.ipc)).join('')}</div>`;
    if (mostrarResv && aumResv.length)  h += `<div class="tarjeta-lista">${aumResv.map(e=>tarjetaAumentoCompacta(e,estado.mesElegido,estado.anioElegido)).join('')}</div>`;
  }
  if (visibleProx.length > 0) {
    h += `<div class="sec-titulo sep">Proximo: ${NOMBRES_MESES[nxM]} ${nxY} (${visibleProx.length})</div>`;
    if (mostrarPend && proxPend.length) h += `<div class="tarjeta-lista tenue">${proxPend.map(e=>tarjetaAumento(e,nxM,nxY,estado.ipc)).join('')}</div>`;
    if (mostrarResv && proxResv.length) h += `<div class="tarjeta-lista tenue">${proxResv.map(e=>tarjetaAumentoCompacta(e,nxM,nxY)).join('')}</div>`;
  }
  contenido.innerHTML = h;
}

// "Marcar enviado": aplica el aumento al alquiler y guarda la marca (con el importe anterior,
// para poder deshacer).
async function marcarAumentoEnviado(clave) {
  const entrada = entradaPorDireccion(clave.split('|')[1]);
  if (!entrada) return;
  const hoy     = new Date();
  const nuevoMonto = D.nuevoImporte(entrada.importe, estado.ipc);
  const anterior = { importeAnterior: entrada.importe, ultimoAumentoAnterior: D.aFechaISO(entrada.ultimoAumento) };
  if (await guardarAumento(entrada, nuevoMonto, hoy)) {
    estado.marcas[clave] = { fecha: formatearFecha(hoy), importeNuevo: nuevoMonto, ipc: estado.ipc, ...anterior };
    await guardarMarcas();
  }
}

// Deshacer "enviado": vuelve el alquiler al importe anterior y saca la marca.
async function deshacerAumentoEnviado(clave) {
  const entrada = entradaPorDireccion(clave.split('|')[1]);
  const mk = estado.marcas[clave];
  // Revierte el importe solo si la marca guardo el estado previo (las importadas no lo tienen).
  if (entrada && mk && mk.importeAnterior) {
    try {
      reemplazarEntrada(await call('modificarContrato', entrada.id,
        { importe: mk.importeAnterior, ultimoAumento: mk.ultimoAumentoAnterior || null }));
    } catch (err) {
      mostrarAviso('Error al revertir el aumento: ' + esc(err.message), 'error');
      return false;
    }
  }
  delete estado.marcas[clave];
  await guardarMarcas();
  return true;
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.getElementById('contenido').addEventListener('change', async e => {
    const chk = e.target.closest('[data-aum]');
    if (!chk) return;
    chk.disabled = true;
    if (chk.checked) await marcarAumentoEnviado(chk.dataset.aum);
    else await deshacerAumentoEnviado(chk.dataset.aum);
    dibujar();
  });

  document.getElementById('contenido').addEventListener('click', async e => {
    // ── aumentos resueltos: desplegar el detalle / deshacer ─────────────────────
    const aumDeshacer = e.target.closest('[data-aum-deshacer]');
    if (aumDeshacer) {
      aumDeshacer.disabled = true;
      if (await deshacerAumentoEnviado(aumDeshacer.dataset.aumDeshacer)) {
        aumAbiertos.delete(aumDeshacer.dataset.aumDeshacer);
        mostrarAviso('&#8617; Aumento deshecho: el alquiler volvió al importe anterior', 'info');
      }
      dibujar();
      return;
    }
    const aumAlternar = e.target.closest('[data-aum-alternar]');
    if (aumAlternar) {
      const k = aumAlternar.dataset.aumAlternar;
      if (aumAbiertos.has(k)) aumAbiertos.delete(k); else aumAbiertos.add(k);
      dibujar();
      return;
    }

    const btnCopiar = e.target.closest('[data-copiar]');
    if (btnCopiar) {
      copiarAlPortapapeles(btnCopiar.dataset.copiar);
      btnCopiar.classList.add('copiado');
      const original = btnCopiar.textContent;
      btnCopiar.textContent = '✓';
      setTimeout(() => { btnCopiar.textContent = original; btnCopiar.classList.remove('copiado'); }, 1800);
      return;
    }

    // ── na-start (iniciar "no aumenta") ──────────────────────────────────────
    const naStart = e.target.closest('[data-na-inicio]');
    if (naStart) {
      pendientes.noAumenta = naStart.dataset.naInicio;
      pendientes.noRenueva = null;
      dibujar();
      setTimeout(() => { const el = document.getElementById('inp-na-desc'); if (el) el.focus(); }, 50);
      return;
    }
    if (e.target.closest('[data-na-cancelar]')) { pendientes.noAumenta = null; dibujar(); return; }

    // ── na-conf (confirmar no aumenta) ────────────────────────────────────────
    const naConf = e.target.closest('[data-na-conf]');
    if (naConf) {
      const naKy   = naConf.dataset.naConf;
      const elDescripcion = document.getElementById('inp-na-desc');
      const descripcion   = elDescripcion ? elDescripcion.value.trim() : '';
      const entrada  = entradaPorDireccion(naKy.split('|')[1]);   // na|dir|m|y
      estado.marcas[naKy]  = { fecha: formatearFecha(new Date()), descripcion };
      guardarMarcas();
      pendientes.noAumenta = null;
      if (entrada && descripcion) await guardarNotas(entrada, agregarNota(entrada, `NO AUMENTA: ${descripcion}`));
      dibujar();
      return;
    }

    // ── un-na (deshacer no aumenta) ───────────────────────────────────────────
    const unNa = e.target.closest('[data-des-na]');
    if (unNa) { delete estado.marcas[unNa.dataset.desNa]; guardarMarcas(); dibujar(); return; }

  });
}
