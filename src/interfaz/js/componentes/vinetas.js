
// Campo de "viñetas": cada valor (edificio, telefono, mail, propietario...) es una viñeta
// con su X, y una viñeta "+" agrega otro. El <input> original queda oculto y sigue siendo
// el que guarda el texto (unido con el separador de siempre), asi el resto del codigo
// lee y escribe .value igual que antes.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

export function makeChips(id, opts) {
  const store = document.getElementById(id);
  const { split, join, placeholder = 'Agregar...', addLabel = 'Agregar', isBusy = () => false } = opts;
  let items = split(store.value || '');

  const box = document.createElement('div');
  box.className = 'chips';
  box.id = id + '-chips';
  const list = document.createElement('span');
  list.className = 'chips-list';
  const entry = document.createElement('input');
  entry.type = 'text';
  entry.id = id + '-entry';
  entry.className = 'chips-entry';
  entry.placeholder = placeholder;
  entry.autocomplete = 'off';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'chip chip-add';
  add.innerHTML = '&#65291; ' + esc(addLabel);
  box.append(list, entry, add);
  store.type = 'hidden';
  store.after(box);

  const paint = () => {
    list.innerHTML = items.map((t, i) =>
      `<span class="chip" data-i="${i}"><span class="chip-txt" title="Clic para corregir">${esc(t)}</span>` +
      `<button type="button" class="chip-x" data-x="${i}" title="Quitar">&times;</button></span>`).join('');
    proto.set.call(store, join(items));          // el valor nativo tambien queda al dia
    const editing = document.activeElement === entry || entry.value;
    entry.hidden = items.length > 0 && !editing;
    add.hidden = !entry.hidden;
  };
  const commit = () => {
    const t = entry.value.trim();
    if (t) items.push(...split(t));
    entry.value = '';
    paint();
    if (t) entry.dispatchEvent(new Event('input'));   // cierra la lista de sugerencias
  };

  // .value del input oculto = viñetas + lo que se este escribiendo (no se pierde nada).
  Object.defineProperty(store, 'value', {
    configurable: true,
    get: () => join([...items, ...split(entry.value)]),
    set: v => { items = split(v == null ? '' : String(v)); entry.value = ''; paint(); proto.set.call(store, join(items)); },
  });

  add.addEventListener('click', () => { entry.hidden = false; add.hidden = true; entry.focus(); });
  entry.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !isBusy()) { e.preventDefault(); commit(); if (entry.hidden === false) entry.focus(); }
    else if (e.key === 'Escape' && entry.value) { e.stopPropagation(); entry.value = ''; paint(); }
  });
  entry.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== entry) commit(); }, 180));
  list.addEventListener('click', e => {
    const x = e.target.closest('[data-x]');
    if (x) { items.splice(+x.dataset.x, 1); paint(); return; }
    const chip = e.target.closest('.chip');
    if (chip) {                                   // corregir: vuelve al campo de texto
      commit();
      const [t] = items.splice(+chip.dataset.i, 1);
      entry.value = t; paint(); entry.hidden = false; add.hidden = true; entry.focus();
    }
  });
  box.addEventListener('click', e => { if (e.target === box) { if (entry.hidden) add.click(); else entry.focus(); } });

  paint();
  return {
    add(t) { items.push(...split(t)); entry.value = ''; paint(); },
    entry, box,
  };
}


// Elegir UNA opcion entre viñetas (garantia, duracion). Usa el <select> original (oculto)
// como dato: sus <option> son las viñetas. Tocar la elegida la deselecciona. La viñeta
// "+" permite escribir otra opcion; onAdd(nombre) la agrega al select y la elige.
const selProto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
export function makePicker(id, { onAdd, addLabel = 'Otra', placeholder = 'Escribí y Enter' }) {
  const sel = document.getElementById(id);
  const box = document.createElement('div');
  box.className = 'chips picker';
  box.id = id + '-picker';
  sel.hidden = true;
  sel.after(box);
  const paint = () => {
    const v = selProto.get.call(sel);
    box.innerHTML = [...sel.options].filter(o => o.value).map(o =>
      `<button type="button" class="chip pick${o.value === v ? ' on' : ''}" data-v="${esc(o.value)}">${esc(o.textContent)}</button>`).join('')
      + `<button type="button" class="chip chip-add" data-add>&#65291; ${esc(addLabel)}</button>`
      + `<input type="text" class="chips-entry" id="${id}-entry" placeholder="${esc(placeholder)}" hidden autocomplete="off">`;
  };
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get: () => selProto.get.call(sel),
    set: v => { selProto.set.call(sel, v); paint(); },
  });
  const pick = v => { selProto.set.call(sel, v); paint(); sel.dispatchEvent(new Event('change')); };
  box.addEventListener('click', e => {
    const b = e.target.closest('.pick');
    if (b) { pick(b.dataset.v === selProto.get.call(sel) ? '' : b.dataset.v); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      const inp = box.querySelector('.chips-entry');
      add.hidden = true; inp.hidden = false; inp.focus();
    }
  });
  box.addEventListener('keydown', e => {
    if (!e.target.classList.contains('chips-entry')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = e.target.value.trim();
      e.target.value = '';                       // que el focusout al repintar no lo agregue otra vez
      if (t) { onAdd(t); paint(); sel.dispatchEvent(new Event('change')); }
      else paint();
    } else if (e.key === 'Escape') { e.stopPropagation(); e.target.value = ''; paint(); }
  });
  // Si sale del campo sin Enter, lo escrito igual queda elegido (no se pierde).
  box.addEventListener('focusout', e => {
    if (!e.target.classList.contains('chips-entry') || e.target.hidden || !box.contains(e.target)) return;
    const t = e.target.value.trim();
    e.target.value = '';
    if (t) { onAdd(t); paint(); sel.dispatchEvent(new Event('change')); } else setTimeout(paint, 150);
  });
  paint();
  return { refresh: paint };
}
