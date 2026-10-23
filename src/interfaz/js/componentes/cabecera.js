// Cabecera: modo claro/oscuro y menu ☰.

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  // Modo claro / oscuro (por defecto sigue a Windows; el boton lo fija)
  const themeBtn = document.getElementById('btn-theme');
  const SUN  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const paintThemeBtn = () => {
    const dark = Theme.get() === 'dark';
    themeBtn.innerHTML = dark ? SUN : MOON;
    themeBtn.title = dark ? 'Pasar a modo claro' : 'Pasar a modo oscuro';
  };
  paintThemeBtn();
  themeBtn.addEventListener('click', () => { Theme.toggle(); paintThemeBtn(); });
  document.addEventListener('modo-color', paintThemeBtn);   // tambien cuando cambia el modo de Windows

  // Menu desplegable (☰)
  const menuBtn = document.getElementById('btn-menu'), menu = document.getElementById('hdr-menu');
  const closeMenu = () => { menu.hidden = true; };
  menuBtn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  menu.addEventListener('click', e => { if (e.target.closest('.menu-item')) closeMenu(); });
  document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
}
