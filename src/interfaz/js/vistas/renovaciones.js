// Pestaña Renovaciones: contratos que vencen, tarjetas y acciones (renovado, no renueva).
import * as D from '../../../dominios/index.js';
import { formatearFecha, claveNoRenueva, interpretarDMA, interpretarISO, duracionReal, claveVenc, claveVencRenovado } from '../../../dominios/index.js';
import { dibujar } from '../app.js';
import { call } from '../nucleo/api.js';
import { agregarNota, entradaPorDireccion, obtenerFechaVenc, obtenerVencidosAtrasados, obtenerVencimientos, esVencResuelto, guardarMarcas, guardarNotas, guardarRenovacion, colorVenc, mensajeRenovacionVenc } from '../nucleo/datos.js';
import { copiarAlPortapapeles, esc, mostrarAviso } from '../nucleo/dom.js';
import { estado, reemplazarEntrada } from '../nucleo/estado.js';
import { NOMBRES_MESES, diasFaltan, formatearDinero, formatearNotas, mesesAtras } from '../nucleo/formato.js';
import { datosPersonas, filtroResueltos, mesSiguiente, pendientes } from './tarjetas.js';

function tarjetaVencCompacta(e) {
  const mk = estado.marcas[claveVenc(e)];
  const esCicloRenovado = !!(mk && mk.nuevaInicio && mk.aniosRenovacion);
  const marcaActiva = esCicloRenovado ? estado.marcas[claveVencRenovado(e)] : mk;
  const nrMk = estado.marcas[claveNoRenueva(e)];
  if (marcaActiva) {
    const atributoDeshacer = esCicloRenovado ? `data-un-ren-r="${esc(e.direccion)}"` : `data-un-ren="${esc(e.direccion)}"`;
    return `<div class="card card-compact" style="border-left:3px solid var(--green)">
      <div class="card-compact-row">
        <span class="titulo-compacto">${esc(e.direccion)}</span>
        <span class="meta-chica">&#10003; Renovado ${marcaActiva.fecha}${marcaActiva.nuevaInicio ? ' &middot; ' + marcaActiva.nuevaInicio + ' &middot; ' + marcaActiva.aniosRenovacion + 'a' : ''}</span>
        <button class="unmark-btn" ${atributoDeshacer} title="Deshacer">&#8617;</button>
      </div>
    </div>`;
  }
  if (nrMk) {
    return `<div class="card card-compact" style="border-left:3px solid rgba(150,150,150,0.3)">
      <div class="card-compact-row">
        <span class="titulo-compacto">${esc(e.direccion)}</span>
        <span class="meta-chica">&#10005; No renueva${nrMk.sigueActivo ? ' (sigue activo)' : ''}${nrMk.descripcion ? ' &mdash; ' + esc(nrMk.descripcion) : ''} &middot; ${nrMk.fecha}</span>
        <button class="unmark-btn" data-un-nr="${esc(e.direccion)}" title="Deshacer">&#8617;</button>
      </div>
    </div>`;
  }
  return '';
}

// Genera el bloque de inputs de fecha + plazo para una renovacion pendiente
function _camposVenc(aniosPredeterminados, atributoConfirmar, dirEsc) {
  return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
    <span style="font-size:11px;color:var(--dim)">Inicio:</span>
    <input type="date" id="inp-venc-date" class="date-inp">
    <span style="font-size:11px;color:var(--dim)">Plazo:</span>
    <select id="inp-venc-years" class="date-inp" style="width:auto">
      <option value="1"${aniosPredeterminados===1?' selected':''}>1 año</option>
      <option value="2"${aniosPredeterminados===2?' selected':''}>2 años</option>
      <option value="3"${aniosPredeterminados===3?' selected':''}>3 años</option>
      <option value="4"${aniosPredeterminados===4?' selected':''}>4 años</option>
    </select>
    <input type="text" id="inp-venc-desc" placeholder="Comentario (opcional)" class="date-inp" style="flex:1;min-width:140px">
    <button class="mark-btn" ${atributoConfirmar}="${dirEsc}">&#10003; Confirmar</button>
    <button class="mark-btn" data-vcancel>&#10005;</button>
  </div>`;
}

function pieVenc(e) {
  const mk          = estado.marcas[claveVenc(e)];
  const esCicloRenovado  = !!(mk && mk.nuevaInicio && mk.aniosRenovacion); // ya fue renovado -> ciclo post-renovacion
  const mkR         = estado.marcas[claveVencRenovado(e)];                          // mark del ciclo post-renovacion

  // ── CICLO POST-RENOVACION ─────────────────────────────────────────────────
  if (esCicloRenovado) {
    if (mkR) {
      // Ya se marco la segunda renovacion
      const renewYearsR = mkR.aniosRenovacion || 2;
      let nuevaInfoR = '';
      if (mkR.nuevaInicio) {
        const ni2 = interpretarDMA(mkR.nuevaInicio);
        if (ni2) {
          const nv2 = new Date(ni2.getFullYear() + renewYearsR, ni2.getMonth(), Math.min(ni2.getDate(), 28));
          nuevaInfoR = `<span class="change-tag">${mk.aniosRenovacion}a &rarr; ${renewYearsR}a &middot; Nuevo venc: ${formatearFecha(nv2)}</span>`;
        }
      }
      return `<div class="card-footer">
        <span class="venc-done-label">&#10003; Renovado ${mkR.fecha}</span>
        ${nuevaInfoR}
        <span style="font-size:10px;color:var(--dim)">1er ciclo: ${mk.fecha}</span>
        <button class="unmark-btn" data-vunc-r="${esc(e.direccion)}" title="Desmarcar renovacion">&times;</button>
      </div>`;
    }
    // Pendiente de confirmar ciclo post-renovacion
    if (pendientes.venc === 'R:' + e.direccion) {
      return _camposVenc(mk.aniosRenovacion || 2, 'data-vconf-r', esc(e.direccion));
    }
    // Mostrar historial de 1er renovacion + boton para marcar 2da
    const ni = interpretarDMA(mk.nuevaInicio);
    const nvDate = ni ? formatearFecha(new Date(ni.getFullYear()+mk.aniosRenovacion, ni.getMonth(), Math.min(ni.getDate(),28))) : '-';
    return `<div class="card-footer" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="font-size:11px;color:var(--amber)">
        Renovado el ${mk.fecha} &middot; Inicio: ${mk.nuevaInicio} &middot; ${mk.aniosRenovacion}a &middot; Vence: ${nvDate}
      </div>
      <div style="display:flex;gap:8px">
        <button class="mark-btn" data-vstart-r="${esc(e.direccion)}">Marcar renovado</button>
        <button class="unmark-btn" style="font-size:11px;color:var(--dim);border:1px solid rgba(var(--fg),0.1);padding:2px 8px;border-radius:4px" data-vunc="${esc(e.direccion)}" title="Deshacer 1er renovacion">&#8617; Deshacer</button>
      </div>
    </div>`;
  }

  // ── CICLO ORIGINAL ─────────────────────────────────────────────────────────
  if (mk) {
    const renewYears = mk.aniosRenovacion || duracionReal(e.contratoDuracion) || 2;
    let nuevaInfo = '';
    if (mk.nuevaInicio) {
      const ni = interpretarDMA(mk.nuevaInicio);
      if (ni) {
        const nv = new Date(ni.getFullYear() + renewYears, ni.getMonth(), Math.min(ni.getDate(), 28));
        nuevaInfo = `<span class="change-tag">Inicio: ${mk.nuevaInicio} &middot; ${renewYears}a &middot; Prox.venc: ${formatearFecha(nv)}</span>`;
      }
    }
    return `<div class="card-footer">
      <span class="venc-done-label">&#10003; Renovado ${mk.fecha}</span>
      ${nuevaInfo}
      <button class="unmark-btn" data-vunc="${esc(e.direccion)}" title="Desmarcar">&times;</button>
    </div>`;
  }

  // ── NO RENUEVA ──────────────────────────────────────────────────────────────
  const nrMk = estado.marcas[claveNoRenueva(e)];
  if (nrMk && D.noRenuevaVigente(e, estado.marcas)) {
    return `<div class="card-footer">
      <span style="font-size:12px;color:var(--dim)">&#10005; No renueva${nrMk.sigueActivo ? ' (sigue activo)' : ''}${nrMk.descripcion ? ' &mdash; ' + esc(nrMk.descripcion) : ''} <span style="font-size:10px;color:var(--dim)">${nrMk.fecha}</span></span>
      <button class="unmark-btn" data-un-nr="${esc(e.direccion)}" title="Deshacer" style="font-size:14px">&#8617;</button>
    </div>`;
  }
  // Ciclo nuevo de un contrato que no renovo pero sigue: se vuelve a avisar.
  const sigueInfo = nrMk ? `<div style="font-size:11px;color:var(--amber);width:100%">No renovó el ${nrMk.fecha} y sigue en el apto: corresponde volver a ofrecer la renovación.</div>` : '';

  if (pendientes.noRenueva === e.direccion) {
    return `<div class="card-footer" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="inp-nr-desc" placeholder="Descripcion (opcional, se guarda en comentarios)" class="date-inp" style="flex:1;min-width:160px">
      <label class="db-chk-label" style="color:var(--dim)" title="Si sigue, se le sigue avisando el IPC y la renovacion cada año. Si no, el alquiler pasa a inactivo.">
        <input type="checkbox" id="inp-nr-sigue"> Sigue en el apto (seguir avisando IPC y renovación)
      </label>
      <button class="mark-btn" data-nr-conf="${esc(e.direccion)}">&#10003; Confirmar</button>
      <button class="mark-btn" data-nr-cancel style="color:var(--dim)">&#10005;</button>
      <div class="field-hint" style="width:100%">Si no sigue en el apto, el alquiler se marca como inactivo (se puede deshacer).</div>
    </div>`;
  }

  const aniosPredeterminados = duracionReal(e.contratoDuracion) || 2;
  if (pendientes.venc === e.direccion) {
    return _camposVenc(aniosPredeterminados, 'data-vconf', esc(e.direccion));
  }

  return `<div class="card-footer" style="flex-wrap:wrap">
    ${sigueInfo}
    <button class="mark-btn" data-vstart="${esc(e.direccion)}">Marcar renovado</button>
    <button class="mark-btn" data-nr-start="${esc(e.direccion)}" style="font-size:11px;border-color:rgba(var(--red-rgb),0.35);color:var(--red)">&#10005; No renueva</button>
  </div>`;
}

function tarjetaVenc(e, color, vencido) {
  color = color || colorVenc(e);
  const mk          = estado.marcas[claveVenc(e)];
  const mkR         = estado.marcas[claveVencRenovado(e)];
  const esCicloRenovado  = !!(mk && mk.nuevaInicio && mk.aniosRenovacion);
  const vd          = obtenerFechaVenc(e) || new Date(0);
  const marcaActiva    = esCicloRenovado ? mkR : mk;
  const nrMkC       = estado.marcas[claveNoRenueva(e)];
  const bcolor      = marcaActiva ? 'var(--green)' : nrMkC ? 'rgba(150,150,150,0.3)' : color;
  const inicioLabel = `Inicio original: ${formatearFecha(e.fechaInicio)}`;
  const etiquetaVencido  = vencido
    ? `<span style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:color-mix(in srgb, var(--red) 75%, var(--text));background:rgba(var(--red-rgb),0.12);border:1px solid rgba(var(--red-rgb),0.3);border-radius:3px;padding:1px 6px;margin-left:6px;vertical-align:middle">VENCIDO ${mesesAtras(vd)}</span>`
    : '';
  return `
    <div class="card" style="border-left:3px solid ${bcolor}${nrMkC ? ';filter:grayscale(1)' : ''}">
      <div class="card-top">
        <span style="color:${bcolor};font-weight:600">${esc(e.direccion)}${etiquetaVencido}</span>
        <span class="badge" style="background:color-mix(in srgb, ${color} 13%, transparent);color:color-mix(in srgb, ${color} 75%, var(--text))">Vence ${formatearFecha(vd)}${diasFaltan(vd)}</span>
      </div>
      ${datosPersonas(e)}
      <div class="card-meta">${inicioLabel} &middot; Contrato: ${esc(e.contratoTexto||'-')} &middot; Alquiler: ${formatearDinero(e.importe, e.moneda)}</div>
      ${formatearNotas(e)}
      <div style="padding:4px 0 2px">
        <button class="mark-btn" data-copy-venc-msg="${esc(mensajeRenovacionVenc(e))}" style="font-size:11px">&#128203; Copiar aviso de renovaci&oacute;n</button>
      </div>
      ${pieVenc(e)}
    </div>`;
}

// Helper para leer los inputs de fecha/plazo del footer de vencimiento
function _leerCamposVenc(aniosPredeterminados) {
  const inp     = document.getElementById('inp-venc-date');
  const elAnios = document.getElementById('inp-venc-years');
  const elDescripcion  = document.getElementById('inp-venc-desc');
  const valorFecha   = inp ? inp.value : '';
  const d       = valorFecha ? interpretarISO(valorFecha) : null;
  const anios   = elAnios ? +elAnios.value : aniosPredeterminados;
  const descripcion    = elDescripcion ? elDescripcion.value.trim() : '';
  return { d, anios, descripcion };
}

// Renovaciones del mes elegido (ventana de 45 dias) que faltan resolver (el circulito de la pestaña).
export function contarPendientesRenovaciones() {
  return obtenerVencimientos(estado.entradas, estado.mesElegido, estado.anioElegido).filter(e => !esVencResuelto(e)).length;
}

// Vencidos sin resolver, el mes elegido y el siguiente, con el filtro de resueltos.
export function dibujarRenovaciones(contenido) {
  const { m: nxM, y: nxY } = mesSiguiente(estado.mesElegido, estado.anioElegido);
  const vencimientos  = obtenerVencimientos(estado.entradas, estado.mesElegido, estado.anioElegido);
  // "Proximo" solo con los que no aparecen ya en el mes elegido (la ventana de 45 dias se superpone).
  const vencIds       = new Set(vencimientos.map(e => e.id));
  const vencProx      = obtenerVencimientos(estado.entradas, nxM, nxY).filter(e => !vencIds.has(e.id));
  const vencAtrasados = obtenerVencidosAtrasados(estado.entradas, estado.mesElegido, estado.anioElegido);
  const filtro = filtroResueltos();
  const mostrarPend = filtro.pendientes, mostrarResv = filtro.resueltos;
  const vencPend = vencimientos.filter(e => !esVencResuelto(e));
  const vencResv = vencimientos.filter(e =>  esVencResuelto(e));
  const proxPend = vencProx.filter(e => !esVencResuelto(e));
  const proxResv = vencProx.filter(e =>  esVencResuelto(e));

  let h = '';
  if (mostrarPend && vencAtrasados.length > 0) {
    h += `<div class="sec-title" style="color:var(--red)">&#9888; Vencidos sin resolver (${vencAtrasados.length})</div>`;
    h += `<div class="card-list">${vencAtrasados.map(e=>tarjetaVenc(e,'var(--red)',true)).join('')}</div>`;
  }
  h += `<div class="sec-title${(mostrarPend && vencAtrasados.length) ? ' sep' : ''}">${NOMBRES_MESES[estado.mesElegido]} ${estado.anioElegido}</div>`;
  const visibleVenc = (mostrarPend ? vencPend : []).concat(mostrarResv ? vencResv : []);
  if (visibleVenc.length === 0) {
    h += `<div class="empty">Sin renovaciones ${filtro.palabra} este mes</div>`;
  } else {
    if (mostrarPend && vencPend.length) h += `<div class="card-list">${vencPend.map(e=>tarjetaVenc(e)).join('')}</div>`;
    if (mostrarResv && vencResv.length) h += `<div class="card-list">${vencResv.map(e=>tarjetaVencCompacta(e)).join('')}</div>`;
  }
  const visibleProx = (mostrarPend ? proxPend : []).concat(mostrarResv ? proxResv : []);
  h += `<div class="sec-title sep">Proximo: ${NOMBRES_MESES[nxM]} ${nxY} (${visibleProx.length})</div>`;
  if (visibleProx.length === 0) {
    h += `<div class="empty">Sin renovaciones ${filtro.palabra} el mes que viene</div>`;
  } else {
    if (mostrarPend && proxPend.length) h += `<div class="card-list">${proxPend.map(e=>tarjetaVenc(e)).join('')}</div>`;
    if (mostrarResv && proxResv.length) h += `<div class="card-list">${proxResv.map(e=>tarjetaVencCompacta(e)).join('')}</div>`;
  }
  contenido.innerHTML = h;
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.getElementById('content').addEventListener('click', async e => {
    // ── nr-start (iniciar "no renueva") ──────────────────────────────────────
    const nrStart = e.target.closest('[data-nr-start]');
    if (nrStart) {
      pendientes.noRenueva = nrStart.dataset.nrStart;
      pendientes.venc  = null;
      pendientes.noAumenta = null;
      dibujar();
      setTimeout(() => { const el = document.getElementById('inp-nr-desc'); if (el) el.focus(); }, 50);
      return;
    }
    if (e.target.closest('[data-nr-cancel]')) { pendientes.noRenueva = null; dibujar(); return; }

    // ── nr-conf (confirmar no renueva) ────────────────────────────────────────
    const nrConf = e.target.closest('[data-nr-conf]');
    if (nrConf) {
      const dir    = nrConf.dataset.nrConf;
      const elDescripcion = document.getElementById('inp-nr-desc');
      const descripcion   = elDescripcion ? elDescripcion.value.trim() : '';
      const sigue  = !!(document.getElementById('inp-nr-sigue') || {}).checked;
      const entrada  = entradaPorDireccion(dir);
      const vd     = entrada ? obtenerFechaVenc(entrada) : null;
      estado.marcas[`nr|${dir}`] = { fecha: formatearFecha(new Date()), descripcion, sigueActivo: sigue, hasta: vd ? D.aFechaISO(vd) : '' };
      await guardarMarcas();
      pendientes.noRenueva = null;
      if (entrada && descripcion) await guardarNotas(entrada, agregarNota(entrada, `NO RENUEVA${sigue ? ' (sigue en el apto)' : ''}: ${descripcion}`));
      if (entrada && !sigue) {
        try { reemplazarEntrada(await call('inactivar', entrada.id)); mostrarAviso('No renueva: el alquiler pasó a inactivo (Ctrl+Z para deshacer)', 'info'); }
        catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
      }
      dibujar();
      return;
    }

    // ── un-nr (deshacer no renueva) ───────────────────────────────────────────
    const unNr = e.target.closest('[data-un-nr]');
    if (unNr) { delete estado.marcas[`nr|${unNr.dataset.unNr}`]; guardarMarcas(); dibujar(); return; }

    // ── copiar aviso de renovacion ───────────────────────────────────────────
    const copiarVenc = e.target.closest('[data-copy-venc-msg]');
    if (copiarVenc) {
      copiarAlPortapapeles(copiarVenc.dataset.copyVencMsg);
      const original = copiarVenc.innerHTML;
      copiarVenc.innerHTML = '&#10003; Copiado';
      copiarVenc.style.color = 'var(--green)';
      setTimeout(() => { copiarVenc.innerHTML = original; copiarVenc.style.color = ''; }, 1800);
      return;
    }

    // ── un-ren / un-ren-r (deshacer renovacion desde card compacto) ──────────
    const unRen = e.target.closest('[data-un-ren]');
    if (unRen) { delete estado.marcas[`v|${unRen.dataset.unRen}`]; guardarMarcas(); dibujar(); return; }
    const unRenR = e.target.closest('[data-un-ren-r]');
    if (unRenR) { delete estado.marcas[`vr|${unRenR.dataset.unRenR}`]; guardarMarcas(); dibujar(); return; }

    // ── vstart / vstart-r ───────────────────────────────────────────────────────
    const vstart = e.target.closest('[data-vstart]');
    if (vstart) { pendientes.noRenueva = null; pendientes.noAumenta = null; pendientes.venc = vstart.dataset.vstart; dibujar(); return; }

    const vstartR = e.target.closest('[data-vstart-r]');
    if (vstartR) { pendientes.noRenueva = null; pendientes.noAumenta = null; pendientes.venc = 'R:' + vstartR.dataset.vstartR; dibujar(); return; }

    if (e.target.closest('[data-vcancel]')) { pendientes.venc = null; dibujar(); return; }

    // ── vconf (ciclo original) ─────────────────────────────────────────────────
    const vconf = e.target.closest('[data-vconf]');
    if (vconf) {
      const dir    = vconf.dataset.vconf;
      const entrada  = entradaPorDireccion(dir);
      const anioPredeterminado   = entrada ? (duracionReal(entrada.contratoDuracion) || 2) : 2;
      const { d, anios, descripcion } = _leerCamposVenc(anioPredeterminado);
      delete estado.marcas[`nr|${dir}`];   // si no habia renovado pero seguia, ahora renovo
      estado.marcas[`v|${dir}`] = { fecha: formatearFecha(new Date()), nuevaInicio: d ? formatearFecha(d) : '', aniosRenovacion: anios };
      guardarMarcas();
      pendientes.venc  = null;
      if (entrada) await guardarRenovacion(entrada, anios, descripcion);
      dibujar();
      return;
    }

    // ── vconf-r (ciclo post-renovacion) ───────────────────────────────────────
    const vconfR = e.target.closest('[data-vconf-r]');
    if (vconfR) {
      const dir    = vconfR.dataset.vconfR;
      const entrada  = entradaPorDireccion(dir);
      const mkPrev = estado.marcas[claveVenc({ direccion: dir })];
      const anioPredeterminado   = mkPrev ? (mkPrev.aniosRenovacion || 2) : 2;
      const { d, anios, descripcion } = _leerCamposVenc(anioPredeterminado);
      delete estado.marcas[`nr|${dir}`];
      estado.marcas[`vr|${dir}`] = { fecha: formatearFecha(new Date()), nuevaInicio: d ? formatearFecha(d) : '', aniosRenovacion: anios };
      guardarMarcas();
      pendientes.venc  = null;
      if (entrada) await guardarRenovacion(entrada, anios, descripcion);
      dibujar();
      return;
    }

    // ── vunc (desmarcar ciclo original) ──────────────────────────────────────
    const vunc = e.target.closest('[data-vunc]');
    if (vunc) {
      delete estado.marcas[`v|${vunc.dataset.vunc}`];
      delete estado.marcas[`vr|${vunc.dataset.vunc}`]; // tambien limpia el ciclo R si lo habia
      guardarMarcas(); dibujar(); return;
    }

    // ── vunc-r (desmarcar solo ciclo post-renovacion) ─────────────────────────
    const vuncR = e.target.closest('[data-vunc-r]');
    if (vuncR) { delete estado.marcas[`vr|${vuncR.dataset.vuncR}`]; guardarMarcas(); dibujar(); return; }
  });
}
