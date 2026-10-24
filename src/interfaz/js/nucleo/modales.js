// Ventanas secundarias: abrir/cerrar; los formularios solo se cierran con Cancelar o Guardar.

export const abrirModal  = id => document.getElementById(id).classList.add('abierto');

export const cerrarModal = id => document.getElementById(id).classList.remove('abierto');

// Los formularios (data-form) solo se cierran con Cancelar o Guardar.
// En el visor no hay nada que perder: ahi se cierran con clic afuera o Escape.
const formularioBloqueado = m => m.hasAttribute('data-formulario') && !document.body.classList.contains('visor');

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  document.querySelectorAll('[data-cerrar-modal]').forEach(b => b.addEventListener('click', () => cerrarModal(b.dataset.cerrarModal)));

  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && !formularioBloqueado(m)) m.classList.remove('abierto'); }));

  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal.abierto').forEach(m => { if (!formularioBloqueado(m)) m.classList.remove('abierto'); }); });
}
