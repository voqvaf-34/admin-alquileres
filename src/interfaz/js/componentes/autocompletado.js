// Autocompletado del formulario de alquiler.
import * as D from '../../../dominios/index.js';
import { Separadores, normalizar } from '../../../dominios/index.js';
import { chipFields, setMoneda } from '../modales/alquiler.js';
import { estado } from '../nucleo/estado.js';

const AC_FIELD_MAP = {
  'm-edificio':  e => e.edificio,
  'm-calle':     e => e.calle,
  'm-prop-entry': e => e.propietario,
  'm-inq-entry':  e => e.inquilino,
  'm-tel-prop-entry':  e => e.telProp,
  'm-tel-inq-entry':   e => e.telInq,
  'm-mail-prop-entry': e => e.mailProp,
  'm-mail-inq-entry':  e => e.mailInq,
};

export let _acIdx       = -1;

export let _acItems     = [];

let _acInput     = null;

let _acHideTimer = null;

function _acEl() { return document.getElementById('ac-dropdown'); }

function acShow(inputEl, suggestions) {
  const el = _acEl();
  if (!suggestions.length) { acHide(); return; }
  _acInput = inputEl;
  _acItems = suggestions;
  _acIdx   = -1;

  const q = normalizar(inputEl.value.trim());
  el.innerHTML = suggestions.map((s, i) => {
    const safe  = s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const start = normalizar(safe).indexOf(q);
    const hi = (start >= 0 && q.length)
      ? safe.slice(0, start) + '<mark>' + safe.slice(start, start + q.length) + '</mark>' + safe.slice(start + q.length)
      : safe;
    return `<div class="ac-item" data-ac-i="${i}">${hi}</div>`;
  }).join('');

  const rect = inputEl.getBoundingClientRect();
  el.style.left    = rect.left + 'px';
  el.style.top     = (rect.bottom + 2) + 'px';
  el.style.width   = Math.max(rect.width, 200) + 'px';
  el.style.display = 'block';
}

function acHide() {
  const el = _acEl();
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  _acIdx = -1; _acItems = []; _acInput = null;
}

function acSetActive(idx) {
  const items = _acEl().querySelectorAll('.ac-item');
  items.forEach((el, i) => el.classList.toggle('ac-active', i === idx));
  if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
  _acIdx = idx;
}

function acSelect(value) {
  const inputId = _acInput ? _acInput.id : null;
  if (inputId && inputId.endsWith('-entry') && chipFields[inputId.replace('-entry', '')]) {
    const base = inputId.replace('-entry', '');
    chipFields[base].add(value);                                 // cada valor elegido es una viñeta
    // tel/mail se completan con el primer nombre; con un segundo nombre no se pisan.
    if ((base === 'm-prop' || base === 'm-inq') && Separadores.personas(document.getElementById(base).value).length === 1) {
      if (inputId === 'm-inq-entry') acFillFromInq(value); else acFillFromProp(value);
    }
    acHide();
    return;
  }
  if (_acInput) { _acInput.value = value; _acInput.dispatchEvent(new Event('change')); }
  if (inputId === 'm-edificio') acPickAddress(value);
  acHide();
}

// En el campo Edificio se puede elegir un apto existente (completa todo) o solo un edificio
// (completa la calle).
function acPickAddress(value) {
  const set = (id, val) => { document.getElementById(id).value = val || ''; };
  const apt = estado.entries.filter(e => e.direccion === value).sort((a, b) => b.id - a.id)[0];
  if (apt) {
    set('m-edificio', apt.edificio); set('m-calle', apt.calle); set('m-unidad', apt.unidad);
    acFillFromDir(value);
    acFlash(['m-edificio', 'm-calle', 'm-unidad']);
  } else {
    const b = estado.entries.find(e => e.edificio === value && e.calle);
    if (b) { set('m-calle', b.calle); acFlash(['m-calle']); }
    setTimeout(() => document.getElementById('m-unidad').focus(), 0);
  }
  updateAddrPreview();
}

export function updateAddrPreview() {
  const N = D;
  const u = document.getElementById('m-unidad').value.trim();
  const txt = N.formatearDireccion({
    edificio: N.mayusculasIniciales(document.getElementById('m-edificio').value),
    calle:    N.mayusculasIniciales(document.getElementById('m-calle').value),
    unidad:   /^\d/.test(u) ? u.toUpperCase() : N.mayusculasIniciales(u),
  });
  document.getElementById('m-dir-preview').textContent = txt || '—';
}

function acFillFromDir(dir) {
  if (!estado.entries) return;
  // si hay varios (misma dirección alquilada varias veces), tomar el más reciente
  const matches = estado.entries.filter(e => e.direccion === dir);
  if (!matches.length) return;
  const e = matches.reduce((a, b) => (b.id > a.id ? b : a));
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('m-prop',      e.propietario);
  set('m-tel-prop',  e.telProp);
  set('m-mail-prop', e.mailProp);
  set('m-importe',   e.importe || '');
  setMoneda(e.moneda);
  // fecha/duracion/notas no se tocan: son datos del nuevo contrato
  acFlash(['m-prop','m-tel-prop','m-mail-prop','m-importe']);
}

function acFillFromProp(prop) {
  const o = estado.owners.find(x => x.nombre === prop);
  if (!o) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('m-tel-prop',  o.telefono);
  set('m-mail-prop', o.mail);
  acFlash(['m-tel-prop','m-mail-prop']);
}

function acFillFromInq(inq) {
  if (!estado.entries) return;
  const matches = estado.entries.filter(e => e.inquilino === inq || Separadores.personas(e.inquilino).includes(inq));
  if (!matches.length) return;
  const e = matches.reduce((a, b) => (b.id > a.id ? b : a));
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('m-tel-inq',  e.telInq);
  set('m-mail-inq', e.mailInq);
  acFlash(['m-tel-inq','m-mail-inq']);
}

function acFlash(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id + '-chips') || document.getElementById(id);
    if (el && document.getElementById(id).value) {
      el.style.transition = 'background 0s';
      el.style.background = 'rgba(var(--accent-rgb),0.18)';
      setTimeout(() => { el.style.transition = 'background 0.6s'; el.style.background = ''; }, 80);
    }
  });
}

export function bindAutocomplete() {
  const dropEl = document.createElement('div');
  dropEl.id = 'ac-dropdown';
  document.body.appendChild(dropEl);

  dropEl.addEventListener('mousedown', e => {
    const item = e.target.closest('.ac-item');
    if (!item) return;
    e.preventDefault();
    acSelect(_acItems[+item.dataset.acI]);
  });

  Object.entries(AC_FIELD_MAP).forEach(([id, getter]) => {
    const inp = document.getElementById(id);
    if (!inp) return;

    inp.addEventListener('input', () => {
      if (!estado.entries) { acHide(); return; }
      const q = normalizar(inp.value.trim());
      if (!q) { acHide(); return; }
      const source = id === 'm-prop-entry' ? estado.owners.map(o => o.nombre)
        : id === 'm-inq-entry' ? estado.entries.flatMap(e => Separadores.personas(e.inquilino))
        : /^m-tel-/.test(id) ? estado.entries.flatMap(e => Separadores.telefonos(getter(e) || ''))
        : /^m-mail-/.test(id) ? estado.entries.flatMap(e => Separadores.mails(getter(e) || ''))
        : id === 'm-edificio' ? [...estado.entries.map(e => e.direccion), ...estado.entries.map(getter)]
        : estado.entries.map(getter);
      const unique = [...new Set(source.filter(v => v && v.trim()))];
      const matches = unique.filter(v => normalizar(v).includes(q)).slice(0, 12);
      acShow(inp, matches);
    });

    inp.addEventListener('keydown', e => {
      if (!_acItems.length || _acEl().style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acSetActive(Math.min(_acIdx + 1, _acItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acSetActive(Math.max(_acIdx - 1, 0));
      } else if (e.key === 'Enter' && _acIdx >= 0) {
        e.preventDefault();
        acSelect(_acItems[_acIdx]);
      } else if (e.key === 'Escape') {
        acHide();
      }
    });

    inp.addEventListener('blur', () => {
      _acHideTimer = setTimeout(acHide, 160);
    });

    inp.addEventListener('focus', () => {
      clearTimeout(_acHideTimer);
    });
  });
}
