// Se carga en <head> para aplicar el tema guardado antes del primer pintado.
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
})();
