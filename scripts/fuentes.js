// Copia las tipografias (paquetes @fontsource, licencia OFL) a src/interfaz/recursos/fonts y genera
// src/interfaz/fuentes.css. La app no carga nada de internet: las fuentes viajan dentro de ella.
// Uso: node scripts/fuentes.js  (despues de agregar una fuente a FUENTES y a dominios/marca.js)
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'src', 'interfaz', 'recursos', 'fonts');
const FUENTES = { rubik: 'Rubik', inter: 'Inter', montserrat: 'Montserrat', nunito: 'Nunito', lora: 'Lora' };
const RANGOS = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

let css = '/* Generado por scripts/fuentes.js: tipografias empaquetadas con la app (licencia OFL). */\n';
for (const [id, familia] of Object.entries(FUENTES)) {
  const paquete = path.join(ROOT, 'node_modules', '@fontsource', id);
  fs.copyFileSync(path.join(paquete, 'LICENSE'), path.join(DEST, `LICENSE-${familia}.txt`));
  for (const peso of [400, 500, 700]) for (const [sub, rango] of Object.entries(RANGOS)) {
    const archivo = `${id}-${sub}-${peso}-normal.woff2`;
    fs.copyFileSync(path.join(paquete, 'files', archivo), path.join(DEST, archivo));
    css += `@font-face { font-family:'${familia}'; font-weight:${peso}; font-display:swap; src:url('recursos/fonts/${archivo}') format('woff2'); unicode-range:${rango}; }\n`;
  }
}
fs.writeFileSync(path.join(ROOT, 'src', 'interfaz', 'fuentes.css'), css);
console.log('ok:', Object.values(FUENTES).join(', '));
