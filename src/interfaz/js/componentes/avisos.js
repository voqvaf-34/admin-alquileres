// Circulito naranja (como una notificacion) en una pestaña: pendientes en el editor, novedades en el Visor.
export function pintarAviso(idPestana, cantidad, palabra = 'pendiente') {
  const tab = document.getElementById(idPestana);
  let aviso = tab.querySelector('.pestana-aviso');
  if (!aviso) { aviso = document.createElement('span'); aviso.className = 'pestana-aviso'; tab.appendChild(aviso); }
  aviso.textContent = cantidad > 99 ? '99+' : String(cantidad);
  aviso.hidden = !cantidad;
  tab.title = cantidad ? `${cantidad} ${palabra}${cantidad === 1 ? '' : 's'}` : '';
}
