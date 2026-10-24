// Configuracion: modo (editor o Visor), versiones de las migraciones, reglas, iconos.
const { app } = require('electron');
const path = require('path');

const REGLAS_PROPIETARIOS   = require('../dominios/reglas/propietarios.json');

const REGLAS_DIRECCIONES = require('../dominios/reglas/direcciones.json');

const VERSION_PROPIETARIOS  = '4';

const VERSION_DIRECCIONES = '2';

const VERSION_LIMPIEZA = '1';

const VERSION_GARANTIAS = '1';

const VERSION_MONEDA = '1';

// "editor" (la app de siempre) o "viewer" (Visor de solo lectura, otro instalador).
const PAQUETE = require('../../package.json');

const MODO = process.env.ADMIN_ALQ_MODE || PAQUETE.modoAdmin || 'editor';

const ES_VISOR = MODO === 'viewer';

// Sin carpeta compartida por defecto: se elige desde la app (Compartir con el Visor).
const CARPETA_COMPARTIDA_PREDETERMINADA = '';

const INTERVALO_SONDEO_MS = +process.env.ADMIN_ALQ_POLL_MS || 10000;

const rutasExcelPredeterminadas = () => [
  path.join(app.getPath('documents'), 'alquileres.xlsx'),
];

const RECURSOS  = path.join(__dirname, '..', 'interfaz', 'recursos');

const ICONO      = path.join(RECURSOS, ES_VISOR ? 'icon-visor.png' : 'icon.png');

const ICONO_BANDEJA = path.join(RECURSOS, ES_VISOR ? 'tray-visor.png' : 'tray.png');

const ARG_INICIO_OCULTO = '--hidden';

const ALTO_BARRA_TITULO = 56;   // = alto de .header en style.css

Object.assign(module.exports, { REGLAS_PROPIETARIOS, REGLAS_DIRECCIONES, VERSION_PROPIETARIOS, VERSION_DIRECCIONES, VERSION_LIMPIEZA, VERSION_GARANTIAS, VERSION_MONEDA, MODO, ES_VISOR, CARPETA_COMPARTIDA_PREDETERMINADA, INTERVALO_SONDEO_MS, rutasExcelPredeterminadas, ICONO, ICONO_BANDEJA, ARG_INICIO_OCULTO, ALTO_BARRA_TITULO });
