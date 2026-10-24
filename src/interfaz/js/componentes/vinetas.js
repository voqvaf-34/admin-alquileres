
// Campo de "viñetas": cada valor (edificio, telefono, mail, propietario...) es una viñeta
// con su X, y una viñeta "+" agrega otro. El <input> original queda oculto y sigue siendo
// el que guarda el texto (unido con el separador de siempre), asi el resto del codigo
// lee y escribe .value igual que antes.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

export function armarChips(id, opciones) {
  const store = document.getElementById(id);
  const { split, join: unir, placeholder: marcador = 'Agregar...', addLabel: etiquetaAgregar = 'Agregar', isBusy: estaOcupado = () => false } = opciones;
  let elementos = split(store.value || '');

  const caja = document.createElement('div');
  caja.className = 'chips';
  caja.id = id + '-chips';
  const lista = document.createElement('span');
  lista.className = 'chips-list';
  const entrada = document.createElement('input');
  entrada.type = 'text';
  entrada.id = id + '-entry';
  entrada.className = 'chips-entry';
  entrada.placeholder = marcador;
  entrada.autocomplete = 'off';
  const agregar = document.createElement('button');
  agregar.type = 'button';
  agregar.className = 'chip chip-add';
  agregar.innerHTML = '&#65291; ' + esc(etiquetaAgregar);
  caja.append(lista, entrada, agregar);
  store.type = 'hidden';
  store.after(caja);

  const pintar = () => {
    lista.innerHTML = elementos.map((t, i) =>
      `<span class="chip" data-i="${i}"><span class="chip-txt" title="Clic para corregir">${esc(t)}</span>` +
      `<button type="button" class="chip-x" data-x="${i}" title="Quitar">&times;</button></span>`).join('');
    proto.set.call(store, unir(elementos));          // el valor nativo tambien queda al dia
    const editando = document.activeElement === entrada || entrada.value;
    entrada.hidden = elementos.length > 0 && !editando;
    agregar.hidden = !entrada.hidden;
  };
  const confirmar = () => {
    const t = entrada.value.trim();
    if (t) elementos.push(...split(t));
    entrada.value = '';
    pintar();
    if (t) entrada.dispatchEvent(new Event('input'));   // cierra la lista de sugerencias
  };

  // .value del input oculto = viñetas + lo que se este escribiendo (no se pierde nada).
  Object.defineProperty(store, 'value', {
    configurable: true,
    get: () => unir([...elementos, ...split(entrada.value)]),
    set: v => { elementos = split(v == null ? '' : String(v)); entrada.value = ''; pintar(); proto.set.call(store, unir(elementos)); },
  });

  agregar.addEventListener('click', () => { entrada.hidden = false; agregar.hidden = true; entrada.focus(); });
  entrada.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !estaOcupado()) { e.preventDefault(); confirmar(); if (entrada.hidden === false) entrada.focus(); }
    else if (e.key === 'Escape' && entrada.value) { e.stopPropagation(); entrada.value = ''; pintar(); }
  });
  entrada.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== entrada) confirmar(); }, 180));
  lista.addEventListener('click', e => {
    const x = e.target.closest('[data-x]');
    if (x) { elementos.splice(+x.dataset.x, 1); pintar(); return; }
    const chip = e.target.closest('.chip');
    if (chip) {                                   // corregir: vuelve al campo de texto
      confirmar();
      const [t] = elementos.splice(+chip.dataset.i, 1);
      entrada.value = t; pintar(); entrada.hidden = false; agregar.hidden = true; entrada.focus();
    }
  });
  caja.addEventListener('click', e => { if (e.target === caja) { if (entrada.hidden) agregar.click(); else entrada.focus(); } });

  pintar();
  return {
    add(t) { elementos.push(...split(t)); entrada.value = ''; pintar(); },
    entry: entrada, box: caja,
  };
}


// Elegir UNA opcion entre viñetas (garantia, duracion). Usa el <select> original (oculto)
// como dato: sus <option> son las viñetas. Tocar la elegida la deselecciona. La viñeta
// "+" permite escribir otra opcion; onAdd(nombre) la agrega al select y la elige.
const selectorModelo = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
export function armarSelector(id, { onAdd: alAgregar, addLabel: etiquetaAgregar = 'Otra', placeholder: marcador = 'Escribí y Enter' }) {
  const sel = document.getElementById(id);
  const caja = document.createElement('div');
  caja.className = 'chips picker';
  caja.id = id + '-picker';
  sel.hidden = true;
  sel.after(caja);
  const pintar = () => {
    const v = selectorModelo.get.call(sel);
    caja.innerHTML = [...sel.options].filter(o => o.value).map(o =>
      `<button type="button" class="chip pick${o.value === v ? ' on' : ''}" data-v="${esc(o.value)}">${esc(o.textContent)}</button>`).join('')
      + `<button type="button" class="chip chip-add" data-add>&#65291; ${esc(etiquetaAgregar)}</button>`
      + `<input type="text" class="chips-entry" id="${id}-entry" placeholder="${esc(marcador)}" hidden autocomplete="off">`;
  };
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get: () => selectorModelo.get.call(sel),
    set: v => { selectorModelo.set.call(sel, v); pintar(); },
  });
  const elegir = v => { selectorModelo.set.call(sel, v); pintar(); sel.dispatchEvent(new Event('change')); };
  caja.addEventListener('click', e => {
    const b = e.target.closest('.pick');
    if (b) { elegir(b.dataset.v === selectorModelo.get.call(sel) ? '' : b.dataset.v); return; }
    const agregar = e.target.closest('[data-add]');
    if (agregar) {
      const inp = caja.querySelector('.chips-entry');
      agregar.hidden = true; inp.hidden = false; inp.focus();
    }
  });
  caja.addEventListener('keydown', e => {
    if (!e.target.classList.contains('chips-entry')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = e.target.value.trim();
      e.target.value = '';                       // que el focusout al repintar no lo agregue otra vez
      if (t) { alAgregar(t); pintar(); sel.dispatchEvent(new Event('change')); }
      else pintar();
    } else if (e.key === 'Escape') { e.stopPropagation(); e.target.value = ''; pintar(); }
  });
  // Si sale del campo sin Enter, lo escrito igual queda elegido (no se pierde).
  caja.addEventListener('focusout', e => {
    if (!e.target.classList.contains('chips-entry') || e.target.hidden || !caja.contains(e.target)) return;
    const t = e.target.value.trim();
    e.target.value = '';
    if (t) { alAgregar(t); pintar(); sel.dispatchEvent(new Event('change')); } else setTimeout(pintar, 150);
  });
  pintar();
  return { refresh: pintar };
}
