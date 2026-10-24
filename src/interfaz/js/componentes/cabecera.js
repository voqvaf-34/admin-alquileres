// Cabecera: modo claro/oscuro y menu ☰.

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Modo claro / oscuro (por defecto sigue a Windows; el boton lo fija)
  const btnTema = document.getElementById('btn-tema');
  const SOL  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const LUNA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const pintarBotonTema = () => {
    const oscuro = Tema.obtener() === 'oscuro';
    btnTema.innerHTML = oscuro ? SOL : LUNA;
    btnTema.title = oscuro ? 'Pasar a modo claro' : 'Pasar a modo oscuro';
  };
  pintarBotonTema();
  btnTema.addEventListener('click', () => { Tema.alternar(); pintarBotonTema(); });
  document.addEventListener('modo-color', pintarBotonTema);   // tambien cuando cambia el modo de Windows

  // Menu desplegable (☰)
  const btnMenu = document.getElementById('btn-menu'), menu = document.getElementById('cab-menu');
  const cerrarMenu = () => { menu.hidden = true; };
  btnMenu.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  menu.addEventListener('click', e => { if (e.target.closest('.menu-item')) cerrarMenu(); });
  document.addEventListener('click', e => { if (!e.target.closest('.menu-caja')) cerrarMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarMenu(); });
}
