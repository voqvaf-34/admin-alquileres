// Se carga en <head> para aplicar el tema y la marca guardados antes del primer pintado.
(function () {
  const KEY = 'alq-theme';
  const get = () => { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (_) { return 'light'; } };
  const apply = t => {
    if (t === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
  };
  apply(get());
  window.Theme = {
    get,
    toggle() {
      const next = get() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (_) {}
      apply(next);
      return next;
    },
  };

  // Ultima marca usada (la guarda componentes/marca.js); los datos reales llegan despues con la base.
  let marca = null;
  try { marca = JSON.parse(localStorage.getItem('alq-marca') || 'null'); } catch (_) {}
  if (!marca) return;
  for (const [k, v] of Object.entries(marca.vars || {})) document.documentElement.style.setProperty(k, v);
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-marca-nombre]').forEach(el => { el.textContent = marca.nombre || ''; el.hidden = !!marca.logo; });
    document.querySelectorAll('[data-marca-logo]').forEach(el => { if (marca.logo) { el.src = marca.logo; el.hidden = false; } });
  });
})();
