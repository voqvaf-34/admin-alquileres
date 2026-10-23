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

  // Accesibilidad (de cada PC): tamaño (zoom de toda la ventana) y opciones que son clases en <html>.
  const A11Y_KEY = 'alq-accesibilidad';
  const A11Y_DEFAULT = { tamano: 1, negrita: false, contraste: false, espaciado: false, subrayar: false, animaciones: 'auto' };
  const leerA11y = () => { try { return { ...A11Y_DEFAULT, ...JSON.parse(localStorage.getItem(A11Y_KEY) || '{}') }; } catch (_) { return { ...A11Y_DEFAULT }; } };
  const aplicarA11y = p => {
    const cl = document.documentElement.classList;
    cl.toggle('a11y-negrita', !!p.negrita);
    cl.toggle('a11y-contraste', !!p.contraste);
    cl.toggle('a11y-espaciado', !!p.espaciado);
    cl.toggle('a11y-subrayar', !!p.subrayar);
    cl.toggle('a11y-sin-animaciones', p.animaciones === 'no');
    cl.toggle('a11y-con-animaciones', p.animaciones === 'si');
    if (window.api && window.api.setZoom) window.api.setZoom(+p.tamano || 1).catch(() => {});
  };
  aplicarA11y(leerA11y());
  window.A11y = {
    DEFAULT: A11Y_DEFAULT,
    get: leerA11y,
    set(p) {
      const v = { ...leerA11y(), ...p };
      try { localStorage.setItem(A11Y_KEY, JSON.stringify(v)); } catch (_) {}
      aplicarA11y(v);
      return v;
    },
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
