// Prueba de punta a punta: primer arranque con una carpeta de datos temporal.
const test   = require('node:test');
const assert = require('node:assert/strict');
const { launch, tmpDir, shot } = require('./helpers');

test('primer arranque: empezar con una base vacia', { timeout: 60000 }, async () => {
  const { app, page, errors } = await launch(tmpDir());
  try {
    await page.waitForSelector('#upload-screen', { state: 'visible' });
    assert.match(await page.textContent('#upload-screen'), /Cómo querés empezar/);
    await shot(page, '01-inicio');
    await page.click('#btn-start-empty');
    await page.waitForSelector('#app-screen', { state: 'visible' });
    assert.match(await page.textContent('#file-info'), /0 activos \/ 0 total/);
    await shot(page, '02-base-vacia');
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});
