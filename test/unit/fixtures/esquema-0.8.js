// Esquema de la base hasta la 0.8.1 (tablas y columnas en ingles), para probar la migracion.
const ESQUEMA_0_8 = `
CREATE TABLE IF NOT EXISTS contracts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  direccion      TEXT    NOT NULL,
  propietario    TEXT    NOT NULL DEFAULT '',
  tel_prop       TEXT    NOT NULL DEFAULT '',
  mail_prop      TEXT    NOT NULL DEFAULT '',
  importe_base   REAL    NOT NULL,
  importe        REAL    NOT NULL,
  ultimo_aumento TEXT,
  remitente      TEXT    NOT NULL DEFAULT '',
  contrato_str   TEXT    NOT NULL DEFAULT '',
  fecha_inicio   TEXT,
  inquilino      TEXT    NOT NULL DEFAULT '',
  tel_inq        TEXT    NOT NULL DEFAULT '',
  mail_inq       TEXT    NOT NULL DEFAULT '',
  notas          TEXT    NOT NULL DEFAULT '',
  inactive       INTEGER NOT NULL DEFAULT 0,
  source_row     INTEGER,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS admins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre     TEXT NOT NULL,
  edificios  TEXT NOT NULL DEFAULT '',
  telefono   TEXT NOT NULL DEFAULT '',
  mail       TEXT NOT NULL DEFAULT '',
  source_row INTEGER
);
CREATE TABLE IF NOT EXISTS marks (
  key  TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre   TEXT NOT NULL,
  rol      TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  mail     TEXT NOT NULL DEFAULT '',
  notas    TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS owners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre     TEXT NOT NULL,
  telefono   TEXT NOT NULL DEFAULT '',
  mail       TEXT NOT NULL DEFAULT '',
  notas      TEXT NOT NULL DEFAULT '',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS contract_owners (
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  owner_id    INTEGER NOT NULL REFERENCES owners(id)    ON DELETE CASCADE,
  orden       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (contract_id, owner_id)
);
CREATE TABLE IF NOT EXISTS owner_docs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id        INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'cedula',
  archivo         TEXT NOT NULL,
  nombre_original TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS owner_accounts (
  owner_id  INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  direccion TEXT NOT NULL,
  cuenta    TEXT NOT NULL,
  PRIMARY KEY (owner_id, direccion)
);
`;

module.exports = { ESQUEMA_0_8 };
