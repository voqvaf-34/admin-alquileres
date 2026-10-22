const test   = require('node:test');
const assert = require('node:assert/strict');
const { fetchLatestIPC } = require('../../src/infraestructura/ine-ipc');

const res = (status, body) => ({ ok: status === 200, status, text: async () => body });

test('usa el mes publicado si la pagina existe', async () => {
  const urls = [];
  const r = await fetchLatestIPC({
    now: new Date(2026, 9, 8),
    fetchImpl: async (u) => { urls.push(u); return res(200, 'últimos 12 meses de 4,15%'); },
  });
  assert.deepEqual(r, { ok: true, ipc: 4.15, month: 9, year: 2026, url: urls[0] });
  assert.match(urls[0], /ipc-setiembre-2026$/);
});

test('cae al mes anterior si todavia no se publico', async () => {
  const r = await fetchLatestIPC({
    now: new Date(2026, 9, 8),
    fetchImpl: async (u) => u.includes('setiembre') ? res(404, '') : res(200, 'Var.12 meses) 08/26: 3,90%'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.ipc, 3.9);
  assert.equal(r.month, 8);
});

test('informa el error si no hay conexion', async () => {
  const r = await fetchLatestIPC({ now: new Date(2026, 9, 8), fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(r.ok, false);
  assert.match(r.error, /offline/);
});
