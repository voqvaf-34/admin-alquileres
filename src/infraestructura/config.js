// Configuracion: modo (editor o Visor), versiones de las migraciones, reglas, iconos.
const { app } = require('electron');
const path = require('path');

const OWNER_RULES   = require('../dominios/reglas/propietarios.json');

const ADDRESS_RULES = require('../dominios/reglas/direcciones.json');

const OWNERS_VERSION  = '4';

const ADDRESS_VERSION = '2';

const CLEANUP_VERSION = '1';

const GARANTIA_VERSION = '1';

const MONEDA_VERSION = '1';

// "editor" (la app de siempre) o "viewer" (Visor de solo lectura, otro instalador).
const PKG = require('../../package.json');

const MODE = process.env.ADMIN_ALQ_MODE || PKG.adminMode || 'editor';

const IS_VIEWER = MODE === 'viewer';

// Sin carpeta compartida por defecto: se elige desde la app (Compartir con el Visor).
const DEFAULT_SHARED_DIR = '';

const POLL_MS = +process.env.ADMIN_ALQ_POLL_MS || 10000;

const defaultExcelPaths = () => [
  path.join(app.getPath('documents'), 'alquileres.xlsx'),
];

const RECURSOS  = path.join(__dirname, '..', 'interfaz', 'recursos');

const ICON      = path.join(RECURSOS, IS_VIEWER ? 'icon-visor.png' : 'icon.png');

const TRAY_ICON = path.join(RECURSOS, IS_VIEWER ? 'tray-visor.png' : 'tray.png');

const START_HIDDEN_ARG = '--hidden';

const TITLEBAR_H = 56;   // = alto de .header en style.css

Object.assign(module.exports, { OWNER_RULES, ADDRESS_RULES, OWNERS_VERSION, ADDRESS_VERSION, CLEANUP_VERSION, GARANTIA_VERSION, MONEDA_VERSION, MODE, IS_VIEWER, DEFAULT_SHARED_DIR, POLL_MS, defaultExcelPaths, ICON, TRAY_ICON, START_HIDDEN_ARG, TITLEBAR_H });
