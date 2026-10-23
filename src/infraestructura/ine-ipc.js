const D = require('../dominios/index.js');

// Busca el IPC interanual publicado por el INE. Si la pagina del mes esperado
// todavia no existe, prueba con el mes anterior.
async function fetchLatestIPC({ now = new Date(), fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  let period = D.ultimoIPCPublicado(now);
  const errors = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = D.urlPaginaIPC(period.month, period.year);
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AdminAlquileres' },
      });
      if (res.ok) {
        const value = D.interpretarIPCDesdeHtml(await res.text());
        if (value != null) return { ok: true, ipc: value, month: period.month, year: period.year, url };
        errors.push(`${url}: valor no encontrado en la pagina`);
      } else {
        errors.push(`${url}: HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
    period = D.mesAnterior(period);
  }
  return { ok: false, error: errors.join(' | ') };
}

module.exports = { fetchLatestIPC };
