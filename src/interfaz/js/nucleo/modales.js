// Ventanas secundarias: abrir/cerrar; los formularios solo se cierran con Cancelar o Guardar.

export const abrirModal  = id => document.getElementById(id).classList.add('open');

export const cerrarModal = id => document.getElementById(id).classList.remove('open');

// Los formularios (data-form) solo se cierran con Cancelar o Guardar.
// En el visor no hay nada que perder: ahi se cierran con clic afuera o Escape.
const formularioBloqueado = m => m.hasAttribute('data-form') && !document.body.classList.contains('viewer');

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => cerrarModal(b.dataset.closeModal)));

  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && !formularioBloqueado(m)) m.classList.remove('open'); }));

  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => { if (!formularioBloqueado(m)) m.classList.remove('open'); }); });
}
