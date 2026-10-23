// Utilidades de las pruebas E2E: lanzar la app real con una carpeta de datos temporal.
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { _electron } = require('playwright-core');

const ROOT  = path.join(__dirname, '..', '..');
const SHOTS = process.env.E2E_SCREENSHOTS || path.join(os.tmpdir(), 'alq-e2e-shots');

// Abre la app (o un .exe empaquetado) fuera de la pantalla, sin abrir links externos ni el
// asistente, con los datos en dataDir. extraEnv suma o pisa variables (undefined = quitarla).
async function launch(dataDir, extraEnv = {}, { ejecutable = null, tamano = { width: 1400, height: 900 } } = {}) {
  const env = { ...process.env, ADMIN_ALQ_NO_EXTERNAL: '1', ADMIN_ALQ_SIN_ASISTENTE: '1', ADMIN_ALQ_FUERA_DE_PANTALLA: '1',
    ADMIN_ALQ_DATA_DIR: dataDir, ADMIN_ALQ_SHARED_DIR: path.join(dataDir, 'compartida'), ...extraEnv };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const app = await _electron.launch(ejecutable
    ? { executablePath: ejecutable, env }
    : { executablePath: require('electron'), args: [ROOT], cwd: ROOT, env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize(tamano).catch(() => {});
  // El modo de color sigue al de Windows: las pruebas lo fijan en claro para no depender de la PC.
  await page.emulateMedia({ colorScheme: 'light' });
  return { app, page, errors };
}

const tmpDir = (prefix = 'alq-e2e-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

// Primer arranque: "Empezar con una base vacia".
async function empezarVacia(page) {
  await page.waitForSelector('#upload-screen', { state: 'visible' });
  await page.click('#btn-start-empty');
  await page.waitForSelector('#app-screen', { state: 'visible' });
}

// Abre Configuracion y espera a que la ventana enfoque el primer campo (lo hace a los 80 ms):
// si se escribe antes, el foco salta en medio y el texto termina en otro campo.
async function abrirConfiguracion(page) {
  await page.click('#btn-menu');
  await page.click('#btn-config');
  await page.waitForSelector('#modal-config.open');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cfg-nombre');
}

// Elige un color sugerido en la pestaña Apariencia (campo 'color' o 'color2').
async function elegirColor(page, color, campo = 'color') {
  await page.click('[data-cfg-tab="apariencia"]');
  await page.click(`[data-color-picker="${campo}"] .cfg-swatch[data-color="${color}"]`);
}

module.exports = { ROOT, SHOTS, launch, tmpDir, shot, empezarVacia, abrirConfiguracion, elegirColor };
