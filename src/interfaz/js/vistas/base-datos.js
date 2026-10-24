// Pestaña Base de Datos: filtros, tabla, detalle y comentarios.
import { esNuevo, puntoNuevo } from '../componentes/novedades.js';
import * as D from '../../../dominios/index.js';
import { formatearFecha, normalizar, interpretarDMA, claveVenc, claveVencRenovado } from '../../../dominios/index.js';
import { borrarEntrada, mostrarModalEdicion } from '../modales/alquiler.js';
import { mostrarLineaTiempo } from '../modales/linea-tiempo.js';
import { guardarMarcas, guardarNotas } from '../nucleo/datos.js';
import { esc } from '../nucleo/dom.js';
import { estado } from '../nucleo/estado.js';
import { NOMBRES_MESES, formatearMails, formatearDinero, formatearNombres, insigniaGarantia, enlaceTelefono } from '../nucleo/formato.js';
import { filaContacto } from './propietarios.js';

function baseFiltrada() {
  if (!estado.entradas) return [];
  // ninguno seleccionado = mostrar todos; uno seleccionado = filtrar
  let lista = (!estado.baseMostrarActivos && !estado.baseMostrarInactivos)
    ? estado.entradas
    : estado.entradas.filter(e => e.inactivo ? estado.baseMostrarInactivos : estado.baseMostrarActivos);
  if (estado.baseFiltroAnio > 0)
    lista = lista.filter(e => e.fechaInicio && e.fechaInicio.getFullYear() === estado.baseFiltroAnio);
  if (estado.baseFiltroMes > 0)
    lista = lista.filter(e => e.fechaInicio && e.fechaInicio.getMonth() + 1 === estado.baseFiltroMes);
  if (estado.baseTextoBusqueda.trim()) {
    const q = normalizar(estado.baseTextoBusqueda);
    lista = lista.filter(e =>
      normalizar(e.direccion).includes(q) ||
      normalizar(e.propietario).includes(q) ||
      normalizar(e.inquilino).includes(q) ||
      (e.telProp||'').includes(q) ||
      (e.telInq||'').includes(q) ||
      normalizar(e.mailProp).includes(q) ||
      normalizar(e.mailInq).includes(q) ||
      normalizar(e.garantia).includes(q) ||
      normalizar(e.remitente).includes(q)
    );
  }
  return lista;
}

// Genera la fila separadora de grupo
function filaSeparadoraBase(etiqueta, cantidad) {
  return `<tr class="base-sep-fila">
    <td colspan="5">
      <div class="base-sep-interior">
        <span class="base-sep-etiqueta">${etiqueta}</span>
        <span class="base-sep-linea"></span>
        <span class="base-sep-cantidad">${cantidad}</span>
      </div>
    </td>
  </tr>`;
}

export function dibujarTablaBase() {
  if (!estado.entradas) return;
  const filtrados = baseFiltrada();
  const porDireccion = D.indicePorDireccion(estado.entradas);   // una vez por dibujo, no por fila
  // Ordenar cronologicamente por fecha de inicio (null al final)
  const ordenados = filtrados.slice().sort((a, b) => {
    const fa = a.fechaInicio ? a.fechaInicio.getTime() : Infinity;
    const fb = b.fechaInicio ? b.fechaInicio.getTime() : Infinity;
    return fa - fb;
  });

  const elCantidad = document.getElementById('base-cantidad');
  if (elCantidad) elCantidad.textContent = `${ordenados.length} / ${estado.entradas.length} registros`;

  const tbody = document.getElementById('base-tbody');
  if (!tbody) return;

  if (ordenados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="vacio">Sin registros que coincidan.</td></tr>`;
    return;
  }

  // ── Logica de agrupacion ──
  // Sin filtros        -> agrupar por ANO de inicio
  // Filtro solo ano    -> agrupar por MES dentro de ese ano
  // Filtro solo mes    -> agrupar por ANO (solo meses coincidentes)
  // Filtro ano + mes   -> sin separadores
  const tieneAnio  = estado.baseFiltroAnio  > 0;
  const tieneMes   = estado.baseFiltroMes > 0;
  let agruparPor = 'none';
  if      (!tieneAnio && !tieneMes) agruparPor = 'year';
  else if ( tieneAnio && !tieneMes) agruparPor = 'month';
  else if (!tieneAnio &&  tieneMes) agruparPor = 'year';
  // hasYear && hasMes -> 'none'

  // Visor: lo nuevo va arriba de todo (grupo "Nuevos") mientras se este en la pestaña
  const nuevos = ordenados.filter(e => esNuevo('basedatos', e.id));
  const resto  = nuevos.length ? ordenados.filter(e => !esNuevo('basedatos', e.id)) : ordenados;

  // Pre-calcular tamanos de grupo para el contador
  const cantidadGrupo = new Map();
  if (agruparPor !== 'none') {
    for (const e of resto) {
      const k = groupKey(e, agruparPor);
      cantidadGrupo.set(k, (cantidadGrupo.get(k) || 0) + 1);
    }
  }

  function groupKey(e, modo) {
    if (!e.fechaInicio) return '__sin_fecha__';
    return modo === 'year'
      ? String(e.fechaInicio.getFullYear())
      : String(e.fechaInicio.getMonth()); // 0-11
  }
  function groupLabel(clave, modo) {
    if (clave === '__sin_fecha__') return 'Sin fecha';
    return modo === 'year' ? clave : NOMBRES_MESES[+clave + 1];
  }

  // Fila principal (+ detalle si esta abierta; si no, se arma al abrirla)
  const fila = e => {
    const estaAbierto = estado.filasAbiertas.has(e.id);
    return `<tr class="base-fila${estaAbierto ? ' expandida' : ''}${e.inactivo ? ' base-fila-inactivo' : ''}" data-id="${e.id}">
      <td class="base-dir">${esc(e.direccion)}${e.inactivo ? `<span class="inactivo-insignia">INACTIVO</span>` : ''}${insigniaGarantia(e)}${e.remitente ? `<span class="delegado-insignia" style="margin-left:8px;font-size:10px" title="Aumentos los hace ${esc(e.remitente)}">&#8618; ${esc(e.remitente)}</span>` : ''}</td>
      <td>${formatearNombres(e.propietario)}</td>
      <td>${formatearNombres(e.inquilino)}</td>
      <td style="white-space:nowrap;color:var(--tenue)">${formatearFecha(e.fechaInicio)}</td>
      <td class="base-flecha">${puntoNuevo('basedatos', e.id)}&#9658;</td>
    </tr>` + (estaAbierto ? filaDetalle(e, porDireccion) : '');
  };

  let html = nuevos.length
    ? filaSeparadoraBase('Nuevos', nuevos.length + (nuevos.length === 1 ? ' contrato' : ' contratos')) + nuevos.map(fila).join('')
    : '';
  let ultimaClave = Symbol(); // garantiza que el primer grupo siempre inserta separador
  for (const e of resto) {
    // ── separador de grupo ──
    if (agruparPor !== 'none') {
      const k = groupKey(e, agruparPor);
      if (k !== ultimaClave) {
        ultimaClave = k;
        const lbl = groupLabel(k, agruparPor);
        const cnt = cantidadGrupo.get(k) || 0;
        html += filaSeparadoraBase(lbl, cnt + (cnt === 1 ? ' contrato' : ' contratos'));
      }
    }
    html += fila(e);
  }

  tbody.innerHTML = html;
}

// Recuadro verde "Renovado el ..." (o "2a renovacion") con su boton para desmarcar.
function insigniaRenovacion(e, dir) {
  const mkV  = estado.marcas[claveVenc(e)];
  const mkVR = estado.marcas[claveVencRenovado(e)];
  if (mkVR) {
    return `<div class="renov-insignia">
      <span>&#10003; 2a renovacion el ${mkVR.fecha}${mkVR.nuevaInicio ? ` &middot; Nuevo inicio: ${mkVR.nuevaInicio} &middot; ${mkVR.aniosRenovacion}a` : ''}</span>
      <button class="desmarcar-btn" data-base-vunc-r="${dir}" title="Desmarcar 2a renovacion" style="margin-left:auto">&times;</button>
    </div>`;
  }
  if (!mkV) return '';
  // Si el vencimiento de la renovacion ya paso, avisar
  let vencNote = '';
  const ni = mkV.nuevaInicio && mkV.aniosRenovacion && interpretarDMA(mkV.nuevaInicio);
  if (ni) {
    const nvDate = new Date(ni.getFullYear() + mkV.aniosRenovacion, ni.getMonth(), Math.min(ni.getDate(), 28));
    if (nvDate <= new Date()) vencNote = `<span style="color:var(--ambar)"> &middot; &#9888; Venc. renovacion: ${formatearFecha(nvDate)}</span>`;
  }
  return `<div class="renov-insignia">
    <span>&#10003; Renovado el ${mkV.fecha}${mkV.nuevaInicio ? ` &middot; Inicio: ${mkV.nuevaInicio} &middot; ${mkV.aniosRenovacion}a` : ''}${vencNote}</span>
    <button class="desmarcar-btn" data-base-vunc="${dir}" title="Desmarcar renovacion" style="margin-left:auto">&times;</button>
  </div>`;
}

// Detalle de un alquiler (se muestra al abrir su fila).
function filaDetalle(e, porDireccion) {
  const dir = esc(e.direccion);
  return `<tr class="base-detalle-fila" data-detalle-id="${e.id}">
      <td colspan="5">
        <div class="base-detalle-interior">
          <div class="base-detalle-grilla">
            <div><span class="lbl">Alquiler: </span><strong>${formatearDinero(e.importe, e.moneda)}</strong></div>
            <div><span class="lbl">Ult. aumento: </span>${e.ultimoAumento ? formatearFecha(e.ultimoAumento) : '<span style="color:var(--tenue)">-</span>'}</div>
            <div><span class="lbl">Contrato: </span>${esc(e.contratoTexto||'-')}</div>
            <div><span class="lbl">Garantía: </span>${e.garantia ? esc(e.garantia) : '<span class="faltante">sin cargar</span>'}</div>
            <div><span class="lbl">Aumentos: </span>${D.gestionadoPor(e) ? esc(D.gestionadoPor(e)) : 'La inmobiliaria'}</div>
            ${e.propietario ? `<div><span class="lbl">Propietario: </span>${formatearNombres(e.propietario)}</div>` : ''}
            <div><span class="lbl">Tel. Prop: </span>${enlaceTelefono(e.telProp)}</div>
            ${e.mailProp ? `<div><span class="lbl">Mail Prop: </span>${formatearMails(e.mailProp)}</div>` : ''}
            ${filaContacto(e, 'dfull')}
            ${e.inquilino ? `<div><span class="lbl">Inquilino: </span>${formatearNombres(e.inquilino)}</div>` : ''}
            <div><span class="lbl">Tel. Inq: </span>${enlaceTelefono(e.telInq)}</div>
            ${e.mailInq ? `<div><span class="lbl">Mail Inq: </span>${formatearMails(e.mailInq)}</div>` : ''}
          </div>
          ${insigniaRenovacion(e, dir)}
          ${e.direccionOriginal && e.direccionOriginal !== e.direccion ? `<div style="margin-top:8px;font-size:11px;color:var(--tenue)">Registrado originalmente como: ${esc(e.direccionOriginal)}</div>` : ''}
          <div class="nota-editar-seccion">
            <span class="nota-etiqueta">Comentarios</span>
            <div class="notas-lista">${D.separarNotas(e.notas).map((n, i) => D.interpretarNotaRenovacion(n) ? '' : `
              <div class="nota-chip"><span class="nota-txt" data-nota-editar="${e.id}" data-i="${i}" title="Clic para corregir">${esc(n)}</span><button class="chip-x" data-nota-borrar="${e.id}" data-i="${i}" title="Borrar comentario">&times;</button></div>`).join('')}
            </div>
            <div class="nota-barra">
              <button class="chip chip-agregar" data-nota-agregar="${e.id}">&#65291; Comentario</button>
              ${D.renovaciones(e, estado.marcas, porDireccion).lista.length ? `<button class="marcar-btn" data-linea-tiempo="${e.id}" title="Cuándo entró, cuándo venció y cada renovación">&#128339; Línea de tiempo</button>` : ''}
            </div>
            <div class="nota-nueva" hidden>
              <textarea class="nota-textarea" rows="2" placeholder="Escribí el comentario (Enter guarda)"></textarea>
              <div class="nota-acciones">
                <button class="marcar-btn" data-nota-cancelar>Cancelar</button>
                <button class="nota-guardar-btn" data-nota-fila="${e.id}">Guardar comentario</button>
              </div>
            </div>
          </div>
          <div class="base-detalle-acciones">
            <button class="marcar-btn btn-editar-fila" data-editar-fila="${e.id}">&#9998; Editar datos</button>
            ${!e.inactivo ? `<button class="marcar-btn btn-inactivar-fila" data-borrar-fila="${e.id}" data-borrar-dir="${dir}">&#8855; Marcar como inactivo</button>` : ''}
          </div>
        </div>
      </td>
    </tr>`;
}

// Inicializa el dropdown de anos del panel DB con los anos en entries
export function llenarAniosBase() {
  const sel = document.getElementById('base-anio');
  if (!sel || !estado.entradas) return;
  const anios = [...new Set(
    estado.entradas.filter(e => e.fechaInicio).map(e => e.fechaInicio.getFullYear())
  )].sort();
  // Limpiar y repoblar (conservar "Todos")
  sel.innerHTML = '<option value="0">Todos</option>';
  anios.forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === estado.baseFiltroAnio) o.selected = true;
    sel.appendChild(o);
  });
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Filtros Base de Datos
  document.getElementById('base-busqueda').addEventListener('input', e => {
    estado.baseTextoBusqueda = e.target.value;
    e.target.closest('.busqueda-caja').classList.toggle('con-texto', !!e.target.value);
    dibujarTablaBase();
  });
  document.getElementById('base-anio').addEventListener('change', e => {
    estado.baseFiltroAnio = +e.target.value;
    dibujarTablaBase();
  });
  document.getElementById('base-mes').addEventListener('change', e => {
    estado.baseFiltroMes = +e.target.value;
    dibujarTablaBase();
  });
  document.getElementById('base-mostrar-activo').addEventListener('change', e => {
    estado.baseMostrarActivos = e.target.checked;
    if (estado.baseMostrarActivos) { estado.baseMostrarInactivos = false; document.getElementById('base-mostrar-inactivo').checked = false; }
    dibujarTablaBase();
  });
  document.getElementById('base-mostrar-inactivo').addEventListener('change', e => {
    estado.baseMostrarInactivos = e.target.checked;
    if (estado.baseMostrarInactivos) { estado.baseMostrarActivos = false; document.getElementById('base-mostrar-activo').checked = false; }
    dibujarTablaBase();
  });

  // Botones clear en buscadores
  document.getElementById('base-busqueda-limpiar').addEventListener('click', () => {
    const inp = document.getElementById('base-busqueda');
    inp.value = ''; estado.baseTextoBusqueda = '';
    inp.closest('.busqueda-caja').classList.remove('con-texto');
    inp.focus(); dibujarTablaBase();
  });

  // Acordeon Base de Datos (event delegation sobre tbody -- persiste entre renders)
  // Enter guarda el comentario (Shift+Enter no hace falta: cada comentario es una viñeta).
  document.getElementById('base-tbody').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('nota-textarea')) {
      e.preventDefault();
      e.target.closest('.nota-editar-seccion').querySelector('[data-nota-fila]').click();
    } else if (e.key === 'Escape' && e.target.classList.contains('nota-textarea')) {
      e.target.closest('.nota-editar-seccion').querySelector('[data-nota-cancelar]').click();
    }
  });
  document.getElementById('base-tbody').addEventListener('click', async e => {
    const porId = id => estado.entradas && estado.entradas.find(en => en.id === id);

    // ── Editar alquiler ──
    const btnEditar = e.target.closest('[data-editar-fila]');
    if (btnEditar) {
      e.stopPropagation();
      const entrada = porId(+btnEditar.dataset.editarFila);
      if (entrada) mostrarModalEdicion(entrada);
      return;
    }

    // ── Marcar inactivo ──
    const btnBorrar = e.target.closest('[data-borrar-fila]');
    if (btnBorrar) {
      e.stopPropagation();
      await borrarEntrada(+btnBorrar.dataset.borrarFila, btnBorrar.dataset.borrarDir);
      return;
    }

    // ── Desmarcar renovacion desde el panel DB ──
    const dbVunc = e.target.closest('[data-base-vunc]');
    if (dbVunc) {
      e.stopPropagation();
      const dir = dbVunc.dataset.baseVunc;
      delete estado.marcas[`v|${dir}`];
      delete estado.marcas[`vr|${dir}`];
      guardarMarcas();
      dibujarTablaBase();
      return;
    }
    const dbVuncR = e.target.closest('[data-base-vunc-r]');
    if (dbVuncR) {
      e.stopPropagation();
      delete estado.marcas[`vr|${dbVuncR.dataset.baseVuncR}`];
      guardarMarcas();
      dibujarTablaBase();
      return;
    }

    // ── Linea de tiempo ──
    const tlBtn = e.target.closest('[data-linea-tiempo]');
    if (tlBtn) { e.stopPropagation(); mostrarLineaTiempo(porId(+tlBtn.dataset.lineaTiempo)); return; }

    // ── Comentarios como viñetas: agregar, corregir, borrar ──
    // Los indices son sobre la lista completa (incluye las notas de renovacion, que no se muestran).
    const notaSec = e.target.closest('.nota-editar-seccion');
    const abrirNuevo = (seccion, texto, idx) => {
      const caja = seccion.querySelector('.nota-nueva'), ta = caja.querySelector('textarea');
      caja.hidden = false; seccion.querySelector('.nota-barra').hidden = true;
      ta.value = texto || ''; ta.dataset.i = idx == null ? '' : idx; ta.focus();
    };
    if (e.target.closest('[data-nota-agregar]')) { e.stopPropagation(); abrirNuevo(notaSec); return; }
    const notaEdit = e.target.closest('[data-nota-editar]');
    if (notaEdit) {
      e.stopPropagation();
      if (document.body.classList.contains('visor')) return;
      const entrada = porId(+notaEdit.dataset.notaEditar);
      abrirNuevo(notaSec, D.separarNotas(entrada.notas)[+notaEdit.dataset.i], +notaEdit.dataset.i);
      return;
    }
    if (e.target.closest('[data-nota-cancelar]')) {
      e.stopPropagation();
      notaSec.querySelector('.nota-nueva').hidden = true; notaSec.querySelector('.nota-barra').hidden = false;
      return;
    }
    const notaDel = e.target.closest('[data-nota-borrar]');
    if (notaDel) {
      e.stopPropagation();
      const entrada = porId(+notaDel.dataset.notaBorrar);
      const lista = D.separarNotas(entrada.notas);
      if (!confirm(`¿Borrar este comentario?\n\n${lista[+notaDel.dataset.i]}`)) return;
      lista.splice(+notaDel.dataset.i, 1);
      if (await guardarNotas(entrada, lista.join(' | '), '&#10003; Comentario borrado')) dibujarTablaBase();
      return;
    }
    const btnNota = e.target.closest('[data-nota-fila]');
    if (btnNota) {
      e.stopPropagation();
      const entrada = porId(+btnNota.dataset.notaFila);
      if (!entrada) return;
      const ta = btnNota.closest('.nota-editar-seccion').querySelector('.nota-textarea');
      const txt = ta.value.replace(/\s*\n+\s*/g, ' ').replace(/\s*\|\s*/g, ' - ').trim();
      const lista = D.separarNotas(entrada.notas);
      if (ta.dataset.i !== '') { if (txt) lista[+ta.dataset.i] = txt; else lista.splice(+ta.dataset.i, 1); }
      else if (txt) lista.push(txt);
      if (await guardarNotas(entrada, lista.join(' | '), '&#10003; Comentario guardado')) dibujarTablaBase();
      return;
    }

    // ── Toggle acordeon (no si el click fue dentro de los comentarios) ──
    if (notaSec) return;
    const fila = e.target.closest('.base-fila');
    if (!fila) return;
    const id = +fila.dataset.id;
    const filaDet = document.querySelector(`.base-detalle-fila[data-detalle-id="${id}"]`);
    if (estado.filasAbiertas.has(id)) {
      estado.filasAbiertas.delete(id);
      fila.classList.remove('expandida');
      if (filaDet) filaDet.remove();
    } else {
      estado.filasAbiertas.add(id);
      fila.classList.add('expandida');
      const entrada = porId(id);
      if (!filaDet && entrada) fila.insertAdjacentHTML('afterend', filaDetalle(entrada, D.indicePorDireccion(estado.entradas)));
    }
  });
}
