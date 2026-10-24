// Autocompletado del formulario de alquiler.
import * as D from '../../../dominios/index.js';
import { Separadores, normalizar } from '../../../dominios/index.js';
import { camposConChips, ponerMoneda } from '../modales/alquiler.js';
import { estado } from '../nucleo/estado.js';

const AC_CAMPOS = {
  'm-edificio':  e => e.edificio,
  'm-calle':     e => e.calle,
  'm-prop-entry': e => e.propietario,
  'm-inq-entry':  e => e.inquilino,
  'm-tel-prop-entry':  e => e.telProp,
  'm-tel-inq-entry':   e => e.telInq,
  'm-mail-prop-entry': e => e.mailProp,
  'm-mail-inq-entry':  e => e.mailInq,
};

export let _acIndice       = -1;

export let _acOpciones     = [];

let _acCampo     = null;

let _acTemporizador = null;

function _acElemento() { return document.getElementById('ac-dropdown'); }

function acMostrar(elCampo, sugerencias) {
  const el = _acElemento();
  if (!sugerencias.length) { acOcultar(); return; }
  _acCampo = elCampo;
  _acOpciones = sugerencias;
  _acIndice   = -1;

  const q = normalizar(elCampo.value.trim());
  el.innerHTML = sugerencias.map((s, i) => {
    const seguro  = s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const inicio = normalizar(seguro).indexOf(q);
    const hi = (inicio >= 0 && q.length)
      ? seguro.slice(0, inicio) + '<mark>' + seguro.slice(inicio, inicio + q.length) + '</mark>' + seguro.slice(inicio + q.length)
      : seguro;
    return `<div class="ac-item" data-ac-i="${i}">${hi}</div>`;
  }).join('');

  const rect = elCampo.getBoundingClientRect();
  el.style.left    = rect.left + 'px';
  el.style.top     = (rect.bottom + 2) + 'px';
  el.style.width   = Math.max(rect.width, 200) + 'px';
  el.style.display = 'block';
}

function acOcultar() {
  const el = _acElemento();
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  _acIndice = -1; _acOpciones = []; _acCampo = null;
}

function acMarcarActiva(idx) {
  const elementos = _acElemento().querySelectorAll('.ac-item');
  elementos.forEach((el, i) => el.classList.toggle('ac-activo', i === idx));
  if (idx >= 0 && elementos[idx]) elementos[idx].scrollIntoView({ block: 'nearest' });
  _acIndice = idx;
}

function acSeleccionar(valor) {
  const idCampo = _acCampo ? _acCampo.id : null;
  if (idCampo && idCampo.endsWith('-entry') && camposConChips[idCampo.replace('-entry', '')]) {
    const base = idCampo.replace('-entry', '');
    camposConChips[base].add(valor);                                 // cada valor elegido es una viñeta
    // tel/mail se completan con el primer nombre; con un segundo nombre no se pisan.
    if ((base === 'm-prop' || base === 'm-inq') && Separadores.personas(document.getElementById(base).value).length === 1) {
      if (idCampo === 'm-inq-entry') acCompletarDesdeInquilino(valor); else acCompletarDesdePropietario(valor);
    }
    acOcultar();
    return;
  }
  if (_acCampo) { _acCampo.value = valor; _acCampo.dispatchEvent(new Event('change')); }
  if (idCampo === 'm-edificio') acElegirDireccion(valor);
  acOcultar();
}

// En el campo Edificio se puede elegir un apto existente (completa todo) o solo un edificio
// (completa la calle).
function acElegirDireccion(valor) {
  const set = (id, val) => { document.getElementById(id).value = val || ''; };
  const apto = estado.entradas.filter(e => e.direccion === valor).sort((a, b) => b.id - a.id)[0];
  if (apto) {
    set('m-edificio', apto.edificio); set('m-calle', apto.calle); set('m-unidad', apto.unidad);
    acCompletarDesdeDireccion(valor);
    acResaltar(['m-edificio', 'm-calle', 'm-unidad']);
  } else {
    const b = estado.entradas.find(e => e.edificio === valor && e.calle);
    if (b) { set('m-calle', b.calle); acResaltar(['m-calle']); }
    setTimeout(() => document.getElementById('m-unidad').focus(), 0);
  }
  actualizarVistaDireccion();
}

export function actualizarVistaDireccion() {
  const N = D;
  const u = document.getElementById('m-unidad').value.trim();
  const txt = N.formatearDireccion({
    edificio: N.mayusculasIniciales(document.getElementById('m-edificio').value),
    calle:    N.mayusculasIniciales(document.getElementById('m-calle').value),
    unidad:   /^\d/.test(u) ? u.toUpperCase() : N.mayusculasIniciales(u),
  });
  document.getElementById('m-dir-vista').textContent = txt || '—';
}

function acCompletarDesdeDireccion(dir) {
  if (!estado.entradas) return;
  // si hay varios (misma dirección alquilada varias veces), tomar el más reciente
  const coincidencias = estado.entradas.filter(e => e.direccion === dir);
  if (!coincidencias.length) return;
  const e = coincidencias.reduce((a, b) => (b.id > a.id ? b : a));
  const set = (id, valor) => { const el = document.getElementById(id); if (el) el.value = valor || ''; };
  set('m-prop',      e.propietario);
  set('m-tel-prop',  e.telProp);
  set('m-mail-prop', e.mailProp);
  set('m-importe',   e.importe || '');
  ponerMoneda(e.moneda);
  // fecha/duracion/notas no se tocan: son datos del nuevo contrato
  acResaltar(['m-prop','m-tel-prop','m-mail-prop','m-importe']);
}

function acCompletarDesdePropietario(prop) {
  const o = estado.propietarios.find(x => x.nombre === prop);
  if (!o) return;
  const set = (id, valor) => { const el = document.getElementById(id); if (el) el.value = valor || ''; };
  set('m-tel-prop',  o.telefono);
  set('m-mail-prop', o.mail);
  acResaltar(['m-tel-prop','m-mail-prop']);
}

function acCompletarDesdeInquilino(inq) {
  if (!estado.entradas) return;
  const coincidencias = estado.entradas.filter(e => e.inquilino === inq || Separadores.personas(e.inquilino).includes(inq));
  if (!coincidencias.length) return;
  const e = coincidencias.reduce((a, b) => (b.id > a.id ? b : a));
  const set = (id, valor) => { const el = document.getElementById(id); if (el) el.value = valor || ''; };
  set('m-tel-inq',  e.telInq);
  set('m-mail-inq', e.mailInq);
  acResaltar(['m-tel-inq','m-mail-inq']);
}

function acResaltar(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id + '-chips') || document.getElementById(id);
    if (el && document.getElementById(id).value) {
      el.style.transition = 'background 0s';
      el.style.background = 'rgba(var(--acento-rgb),0.18)';
      setTimeout(() => { el.style.transition = 'background 0.6s'; el.style.background = ''; }, 80);
    }
  });
}

export function conectarAutocompletado() {
  const elQuitar = document.createElement('div');
  elQuitar.id = 'ac-dropdown';
  document.body.appendChild(elQuitar);

  elQuitar.addEventListener('mousedown', e => {
    const elemento = e.target.closest('.ac-item');
    if (!elemento) return;
    e.preventDefault();
    acSeleccionar(_acOpciones[+elemento.dataset.acI]);
  });

  Object.entries(AC_CAMPOS).forEach(([id, lector]) => {
    const inp = document.getElementById(id);
    if (!inp) return;

    inp.addEventListener('input', () => {
      if (!estado.entradas) { acOcultar(); return; }
      const q = normalizar(inp.value.trim());
      if (!q) { acOcultar(); return; }
      const origen = id === 'm-prop-entry' ? estado.propietarios.map(o => o.nombre)
        : id === 'm-inq-entry' ? estado.entradas.flatMap(e => Separadores.personas(e.inquilino))
        : /^m-tel-/.test(id) ? estado.entradas.flatMap(e => Separadores.telefonos(lector(e) || ''))
        : /^m-mail-/.test(id) ? estado.entradas.flatMap(e => Separadores.mails(lector(e) || ''))
        : id === 'm-edificio' ? [...estado.entradas.map(e => e.direccion), ...estado.entradas.map(lector)]
        : estado.entradas.map(lector);
      const unicos = [...new Set(origen.filter(v => v && v.trim()))];
      const coincidencias = unicos.filter(v => normalizar(v).includes(q)).slice(0, 12);
      acMostrar(inp, coincidencias);
    });

    inp.addEventListener('keydown', e => {
      if (!_acOpciones.length || _acElemento().style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acMarcarActiva(Math.min(_acIndice + 1, _acOpciones.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acMarcarActiva(Math.max(_acIndice - 1, 0));
      } else if (e.key === 'Enter' && _acIndice >= 0) {
        e.preventDefault();
        acSeleccionar(_acOpciones[_acIndice]);
      } else if (e.key === 'Escape') {
        acOcultar();
      }
    });

    inp.addEventListener('blur', () => {
      _acTemporizador = setTimeout(acOcultar, 160);
    });

    inp.addEventListener('focus', () => {
      clearTimeout(_acTemporizador);
    });
  });
}
