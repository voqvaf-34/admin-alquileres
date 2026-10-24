// Se carga en <head> para aplicar el modo de color y la marca guardados antes del primer pintado.
(function () {
  // Modo de color: 'auto' (como Windows, por defecto), 'claro' u 'oscuro'. Es de cada PC, no de la base.
  const KEY = 'alq-tema';
  const sistema = window.matchMedia('(prefers-color-scheme: dark)');
  const obtenerModo = () => { try { const m = localStorage.getItem(KEY); return m === 'oscuro' || m === 'claro' ? m : 'auto'; } catch (_) { return 'auto'; } };
  const obtener = () => { const m = obtenerModo(); return m === 'auto' ? (sistema.matches ? 'oscuro' : 'claro') : m; };
  const aplicar = () => {
    if (obtener() === 'oscuro') document.documentElement.dataset.esquema = 'oscuro';
    else delete document.documentElement.dataset.esquema;
    document.dispatchEvent(new CustomEvent('modo-color'));
  };
  aplicar();
  sistema.addEventListener('change', () => { if (obtenerModo() === 'auto') aplicar(); });
  window.Tema = {
    obtener, obtenerModo,
    ponerModo(m) {
      try { if (m === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch (_) {}
      aplicar();
    },
    // Boton de la cabecera: pasa al modo contrario al que se ve ahora.
    alternar() { this.ponerModo(obtener() === 'oscuro' ? 'claro' : 'oscuro'); return obtener(); },
  };

  // Accesibilidad (de cada PC): tamaño (zoom de toda la ventana) y opciones que son clases en <html>.
  const A11Y_KEY = 'alq-accesibilidad';
  const A11Y_PREDETERMINADO = { tamano: 1, negrita: false, contraste: false, espaciado: false, subrayar: false, animaciones: 'auto' };
  const leerA11y = () => { try { return { ...A11Y_PREDETERMINADO, ...JSON.parse(localStorage.getItem(A11Y_KEY) || '{}') }; } catch (_) { return { ...A11Y_PREDETERMINADO }; } };
  const aplicarA11y = p => {
    const cl = document.documentElement.classList;
    cl.toggle('a11y-negrita', !!p.negrita);
    cl.toggle('a11y-contraste', !!p.contraste);
    cl.toggle('a11y-espaciado', !!p.espaciado);
    cl.toggle('a11y-subrayar', !!p.subrayar);
    cl.toggle('a11y-sin-animaciones', p.animaciones === 'no');
    cl.toggle('a11y-con-animaciones', p.animaciones === 'si');
    if (window.api && window.api.ponerZoom) window.api.ponerZoom(+p.tamano || 1).catch(() => {});
  };
  aplicarA11y(leerA11y());
  window.A11y = {
    PREDETERMINADO: A11Y_PREDETERMINADO,
    obtener: leerA11y,
    poner(p) {
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
