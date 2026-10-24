// Tablas de la base (SQLite) y columnas agregadas en versiones posteriores.
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS contratos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  direccion          TEXT    NOT NULL,
  propietario        TEXT    NOT NULL DEFAULT '',
  tel_prop           TEXT    NOT NULL DEFAULT '',
  mail_prop          TEXT    NOT NULL DEFAULT '',
  importe_base       REAL    NOT NULL,
  importe            REAL    NOT NULL,
  ultimo_aumento     TEXT,
  remitente          TEXT    NOT NULL DEFAULT '',
  contrato_texto     TEXT    NOT NULL DEFAULT '',
  fecha_inicio       TEXT,
  inquilino          TEXT    NOT NULL DEFAULT '',
  tel_inq            TEXT    NOT NULL DEFAULT '',
  mail_inq           TEXT    NOT NULL DEFAULT '',
  notas              TEXT    NOT NULL DEFAULT '',
  inactivo           INTEGER NOT NULL DEFAULT 0,
  fila_origen        INTEGER,
  creado             TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS administraciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  edificios   TEXT NOT NULL DEFAULT '',
  telefono    TEXT NOT NULL DEFAULT '',
  mail        TEXT NOT NULL DEFAULT '',
  fila_origen INTEGER
);
CREATE TABLE IF NOT EXISTS marcas (
  clave TEXT PRIMARY KEY,
  datos TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS contactos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre   TEXT NOT NULL,
  rol      TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  mail     TEXT NOT NULL DEFAULT '',
  notas    TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS propietarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  telefono    TEXT NOT NULL DEFAULT '',
  mail        TEXT NOT NULL DEFAULT '',
  notas       TEXT NOT NULL DEFAULT '',
  contacto_id INTEGER REFERENCES contactos(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS contratos_propietarios (
  contrato_id    INTEGER NOT NULL REFERENCES contratos(id)    ON DELETE CASCADE,
  propietario_id INTEGER NOT NULL REFERENCES propietarios(id) ON DELETE CASCADE,
  orden          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (contrato_id, propietario_id)
);
CREATE TABLE IF NOT EXISTS documentos_propietarios (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  propietario_id  INTEGER NOT NULL REFERENCES propietarios(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'cedula',
  archivo         TEXT NOT NULL,
  nombre_original TEXT NOT NULL DEFAULT '',
  creado          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS cuentas_propietarios (
  propietario_id INTEGER NOT NULL REFERENCES propietarios(id) ON DELETE CASCADE,
  direccion      TEXT NOT NULL,
  cuenta         TEXT NOT NULL,
  PRIMARY KEY (propietario_id, direccion)
);
`;

// Columnas agregadas despues de la primera version (las bases existentes se migran).
const COLUMNAS_AGREGADAS = [
  ['contratos',    'edificio',           "TEXT NOT NULL DEFAULT ''"],
  ['contratos',    'calle',              "TEXT NOT NULL DEFAULT ''"],
  ['contratos',    'unidad',             "TEXT NOT NULL DEFAULT ''"],
  ['contratos',    'direccion_original', "TEXT NOT NULL DEFAULT ''"],
  ['contratos',    'garantia',           "TEXT NOT NULL DEFAULT ''"],
  ['contratos',    'moneda',             "TEXT NOT NULL DEFAULT 'UYU'"],
  ['propietarios', 'cedula',             "TEXT NOT NULL DEFAULT ''"],
  ['propietarios', 'domicilio',          "TEXT NOT NULL DEFAULT ''"],
  ['propietarios', 'estado_civil',       "TEXT NOT NULL DEFAULT ''"],
  ['propietarios', 'cuenta_cobro',       "TEXT NOT NULL DEFAULT ''"],
];

// Hasta la 0.8.1 las tablas y columnas tenian nombres en ingles: al abrir una base de antes
// se renombran (SQLite actualiza solo las referencias entre tablas).
const TABLAS_VIEJAS = [
  ['contract_owners', 'contratos_propietarios'], ['owner_docs', 'documentos_propietarios'],
  ['owner_accounts', 'cuentas_propietarios'], ['contracts', 'contratos'], ['admins', 'administraciones'],
  ['marks', 'marcas'], ['settings', 'ajustes'], ['contacts', 'contactos'], ['owners', 'propietarios'],
];
const COLUMNAS_VIEJAS = [
  ['contratos', 'contrato_str', 'contrato_texto'], ['contratos', 'inactive', 'inactivo'],
  ['contratos', 'source_row', 'fila_origen'], ['contratos', 'created_at', 'creado'],
  ['contratos', 'updated_at', 'actualizado'], ['administraciones', 'source_row', 'fila_origen'],
  ['marcas', 'key', 'clave'], ['marcas', 'data', 'datos'], ['ajustes', 'key', 'clave'], ['ajustes', 'value', 'valor'],
  ['propietarios', 'contact_id', 'contacto_id'], ['contratos_propietarios', 'contract_id', 'contrato_id'],
  ['contratos_propietarios', 'owner_id', 'propietario_id'], ['documentos_propietarios', 'owner_id', 'propietario_id'],
  ['documentos_propietarios', 'created_at', 'creado'], ['cuentas_propietarios', 'owner_id', 'propietario_id'],
];

// Claves de la tabla ajustes que tambien estaban en ingles.
const CLAVES_VIEJAS = [
  ['initialized', 'inicializada'], ['importedFrom', 'importadoDe'], ['importedAt', 'importadoEl'],
  ['ownersVersion', 'versionPropietarios'], ['ownersReview', 'revisionPropietarios'],
  ['addressVersion', 'versionDirecciones'], ['cleanupVersion', 'versionLimpieza'], ['cleanupBorrados', 'limpiezaBorrados'],
  ['garantiaVersion', 'versionGarantias'], ['monedaVersion', 'versionMoneda'], ['sharedDir', 'carpetaCompartida'],
  ['msgRenovacion', 'mensajeRenovacionTexto'], ['msgAumentoInq', 'mensajeAumentoInq'], ['msgAumentoProp', 'mensajeAumentoProp'],
];

module.exports = { ESQUEMA, COLUMNAS_AGREGADAS, TABLAS_VIEJAS, COLUMNAS_VIEJAS, CLAVES_VIEJAS };
