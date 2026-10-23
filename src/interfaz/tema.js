// Se carga en <head> para aplicar el modo de color y la marca guardados antes del primer pintado.
(function () {
  // Modo de color: 'auto' (como Windows, por defecto), 'light' o 'dark'. Es de cada PC, no de la base.
  const KEY = 'alq-theme';
  const sistema = window.matchMedia('(prefers-color-scheme: dark)');
  const getModo = () => { try { const m = localStorage.getItem(KEY); return m === 'dark' || m === 'light' ? m : 'auto'; } catch (_) { return 'auto'; } };
  const get = () => { const m = getModo(); return m === 'auto' ? (sistema.matches ? 'dark' : 'light') : m; };
  const apply = () => {
    if (get() === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    document.dispatchEvent(new CustomEvent('modo-color'));
  };
  apply();
  sistema.addEventListener('change', () => { if (getModo() === 'auto') apply(); });
  window.Theme = {
    get, getModo,
    setModo(m) {
      try { if (m === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch (_) {}
      apply();
    },
    // Boton de la cabecera: pasa al modo contrario al que se ve ahora.
    toggle() { this.setModo(get() === 'dark' ? 'light' : 'dark'); return get(); },
  };

  // Ultima marca usada (la guarda componentes/marca.js); los datos reales llegan despues con la base.
  let marca = null;
  try { marca = JSON.parse(localStorage.getItem('alq-marca') || 'null'); } catch (_) {}
  if (!marca) return;
  for (const [k, v] of Object.entries(marca.vars || {})) document.documentElement.style.setProperty(k, v);
  if (marca.tema) document.documentElement.dataset.tema = marca.tema;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-marca-nombre]').forEach(el => { el.textContent = marca.nombre || ''; el.hidden = !!marca.logo; });
    document.querySelectorAll('[data-marca-logo]').forEach(el => { if (marca.logo) { el.src = marca.logo; el.hidden = false; } });
  });
})();
