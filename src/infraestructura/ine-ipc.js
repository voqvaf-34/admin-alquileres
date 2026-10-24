const D = require('../dominios/index.js');

// Busca el IPC interanual publicado por el INE. Si la pagina del mes esperado
// todavia no existe, prueba con el mes anterior.
async function consultarUltimoIPC({ now: ahora = new Date(), fetchImpl = fetch, timeoutMs: esperaMs = 15000 } = {}) {
  let periodo = D.ultimoIPCPublicado(ahora);
  const errores = [];
  for (let intento = 0; intento < 2; intento++) {
    const url = D.urlPaginaIPC(periodo.month, periodo.year);
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(esperaMs),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AdminAlquileres' },
      });
      if (res.ok) {
        const valor = D.interpretarIPCDesdeHtml(await res.text());
        if (valor != null) return { ok: true, ipc: valor, month: periodo.month, year: periodo.year, url };
        errores.push(`${url}: valor no encontrado en la pagina`);
      } else {
        errores.push(`${url}: HTTP ${res.status}`);
      }
    } catch (e) {
      errores.push(`${url}: ${e.message}`);
    }
    periodo = D.mesAnterior(periodo);
  }
  return { ok: false, error: errores.join(' | ') };
}

module.exports = { consultarUltimoIPC };
