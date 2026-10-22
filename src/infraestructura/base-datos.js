const fs   = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { nameKey } = require('../dominios/index.js');

const SCHEMA = `
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

// Columnas agregadas despues de la primera version (las bases existentes se migran).
const ADDED_COLUMNS = [
  ['contracts', 'edificio',           "TEXT NOT NULL DEFAULT ''"],
  ['contracts', 'calle',              "TEXT NOT NULL DEFAULT ''"],
  ['contracts', 'unidad',             "TEXT NOT NULL DEFAULT ''"],
  ['contracts', 'direccion_original', "TEXT NOT NULL DEFAULT ''"],
  ['contracts', 'garantia',           "TEXT NOT NULL DEFAULT ''"],
  ['contracts', 'moneda',             "TEXT NOT NULL DEFAULT 'UYU'"],
  ['owners',    'cedula',             "TEXT NOT NULL DEFAULT ''"],
  ['owners',    'domicilio',          "TEXT NOT NULL DEFAULT ''"],
  ['owners',    'estado_civil',       "TEXT NOT NULL DEFAULT ''"],
  ['owners',    'cuenta_cobro',       "TEXT NOT NULL DEFAULT ''"],
];
const UNDO_LIMIT = 40;
const UNDO_GROUP_MS = 1500;

const CONTRACT_COLS = {
  direccion: 'direccion', propietario: 'propietario', telProp: 'tel_prop', mailProp: 'mail_prop',
  importeBase: 'importe_base', importe: 'importe', ultimoAumento: 'ultimo_aumento',
  remitente: 'remitente', garantia: 'garantia', moneda: 'moneda', contratoStr: 'contrato_str', fechaInicio: 'fecha_inicio',
  inquilino: 'inquilino', telInq: 'tel_inq', mailInq: 'mail_inq', notas: 'notas',
  inactive: 'inactive', sourceRow: 'source_row',
};
// Campos que la UI puede modificar sueltos (aumento enviado, comentario).
const PATCHABLE = new Set(['importe', 'ultimoAumento', 'notas']);

function s(v) { return v == null ? '' : String(v).trim(); }
function n(v) { const x = Number(v); return isFinite(x) ? x : null; }

function rowToContract(r) {
  return {
    id: r.id, direccion: r.direccion, propietario: r.propietario, telProp: r.tel_prop,
    mailProp: r.mail_prop, importeBase: r.importe_base, importe: r.importe,
    ultimoAumento: r.ultimo_aumento, remitente: r.remitente, contratoStr: r.contrato_str,
    fechaInicio: r.fecha_inicio, inquilino: r.inquilino, telInq: r.tel_inq,
    mailInq: r.mail_inq, notas: r.notas, inactive: !!r.inactive,
    edificio: r.edificio || '', calle: r.calle || '', unidad: r.unidad || '',
    direccionOriginal: r.direccion_original || '', garantia: r.garantia || '',
    moneda: r.moneda === 'USD' ? 'USD' : 'UYU',
  };
}

class Store {
  static async open(filePath, opts = {}) {
    const SQL = await initSqlJs({
      wasmBinary: fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')),
    });
    const exists = fs.existsSync(filePath);
    if (opts.readOnly && !exists) throw new Error('No se encontro la base compartida en ' + filePath);
    const db = exists ? new SQL.Database(fs.readFileSync(filePath)) : new SQL.Database();
    const store = new Store(db, filePath, opts);
    store.SQL = SQL;
    db.run('PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    store.addMissingColumns();
    if (!exists) store.persist();
    return store;
  }

  constructor(db, filePath, opts) {
    this.db = db;
    this.filePath = filePath;
    this.backupDir = opts.backupDir || path.join(path.dirname(filePath), 'backups');
    this.maxBackups = opts.maxBackups || 20;
    this.undoStack = [];
    this.redoStack = [];
    // Modo visor: la base se lee de la carpeta compartida y nunca se escribe.
    this.readOnly = !!opts.readOnly;
    this.onPersist = null;
    this.saveStatus = { ok: true, at: null, error: null };
  }

  addMissingColumns() {
    let changed = false;
    for (const [table, col, def] of ADDED_COLUMNS) {
      const cols = this.all(`PRAGMA table_info(${table})`).map(r => r.name);
      if (!cols.includes(col)) { this.db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); changed = true; }
    }
    if (changed) this.persist();
  }

  // ── deshacer / rehacer ───────────────────────────────────────────────────
  // Guarda una copia de la base antes de un cambio. Cambios seguidos (< 1,5 s) se agrupan
  // en un solo paso, ej. "marcar enviado" = importe + marca.
  checkpoint(label) {
    const now = Date.now();
    const last = this.undoStack[this.undoStack.length - 1];
    if (last && now - last.t < UNDO_GROUP_MS) { last.t = now; return false; }
    this.undoStack.push({ label, t: now, data: this.db.export() });
    this.db.run('PRAGMA foreign_keys = ON;');
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }
  dropCheckpoint() { this.undoStack.pop(); }

  _loadSnapshot(data) {
    this.db.close();
    this.db = new this.SQL.Database(data);
    this.db.run('PRAGMA foreign_keys = ON;');
    this.persist();
  }
  undo() {
    const prev = this.undoStack.pop();
    if (!prev) throw new Error('No hay cambios para deshacer.');
    this.redoStack.push({ label: prev.label, data: this.db.export() });
    this._loadSnapshot(prev.data);
    return prev.label;
  }
  redo() {
    const next = this.redoStack.pop();
    if (!next) throw new Error('No hay cambios para rehacer.');
    this.undoStack.push({ label: next.label, t: 0, data: this.db.export() });
    this._loadSnapshot(next.data);
    return next.label;
  }
  undoStatus() {
    const u = this.undoStack[this.undoStack.length - 1], r = this.redoStack[this.redoStack.length - 1];
    return { canUndo: !!u, undoLabel: u ? u.label : '', canRedo: !!r, redoLabel: r ? r.label : '' };
  }

  // ── infraestructura ──────────────────────────────────────────────────────
  persist() {
    if (this.readOnly) return;
    const data = Buffer.from(this.db.export());
    // sql.js reinicia la conexion en export() y se pierden los PRAGMA.
    this.db.run('PRAGMA foreign_keys = ON;');
    const tmp  = this.filePath + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, this.filePath);
      this.saveStatus = { ok: true, at: new Date().toISOString(), error: null };
    } catch (e) {
      this.saveStatus = { ok: false, at: this.saveStatus.at, error: e.message };
      throw e;
    }
    if (this.onPersist) this.onPersist();
  }

  backup(tag) {
    if (this.readOnly || !fs.existsSync(this.filePath)) return null;
    fs.mkdirSync(this.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest  = path.join(this.backupDir, `alquileres-${stamp}${tag ? '-' + tag : ''}.sqlite`);
    fs.copyFileSync(this.filePath, dest);
    const files = fs.readdirSync(this.backupDir).filter(f => f.endsWith('.sqlite')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - this.maxBackups))) {
      try { fs.unlinkSync(path.join(this.backupDir, f)); } catch (_) {}
    }
    return dest;
  }

  all(sql, params = []) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally { st.free(); }
  }

  transaction(fn) {
    this.db.run('BEGIN');
    try { const r = fn(); this.db.run('COMMIT'); this.persist(); return r; }
    catch (e) { this.db.run('ROLLBACK'); throw e; }
  }

  lastId() { return this.all('SELECT last_insert_rowid() AS id')[0].id; }

  // ── contratos ────────────────────────────────────────────────────────────
  isEmpty() { return this.all('SELECT COUNT(*) AS c FROM contracts')[0].c === 0; }

  listContracts() {
    return this.all('SELECT * FROM contracts ORDER BY id').map(rowToContract);
  }

  getContract(id) {
    const r = this.all('SELECT * FROM contracts WHERE id = ?', [id])[0];
    return r ? rowToContract(r) : null;
  }

  _insertContract(c) {
    const imp = n(c.importeBase);
    if (!s(c.direccion)) throw new Error('La direccion es obligatoria.');
    if (!imp || imp <= 0) throw new Error('El importe es obligatorio.');
    this.db.run(
      `INSERT INTO contracts (direccion, propietario, tel_prop, mail_prop, importe_base, importe,
        ultimo_aumento, remitente, contrato_str, fecha_inicio, inquilino, tel_inq, mail_inq, notas,
        inactive, source_row, edificio, calle, unidad, direccion_original, garantia, moneda)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s(c.direccion), s(c.propietario), s(c.telProp), s(c.mailProp), imp, n(c.importe) || imp,
       c.ultimoAumento || null, s(c.remitente), s(c.contratoStr), c.fechaInicio || null,
       s(c.inquilino), s(c.telInq), s(c.mailInq), s(c.notas), c.inactive ? 1 : 0,
       c.sourceRow == null ? null : c.sourceRow, s(c.edificio), s(c.calle), s(c.unidad), s(c.direccionOriginal), s(c.garantia), c.moneda === 'USD' ? 'USD' : 'UYU']);
    return this.lastId();
  }

  // Las marcas y las cuentas de cobro se guardan por direccion: si un apto cambia de
  // nombre (y ningun otro contrato usa el nombre viejo) se renombran tambien.
  _renameDireccionRefs(oldDir, newDir) {
    if (!oldDir || oldDir === newDir) return;
    if (this.all('SELECT 1 FROM contracts WHERE direccion=?', [oldDir]).length) return;
    this._rekeyMarks(new Map([[oldDir, newDir]]));
    this.db.run(`UPDATE OR IGNORE owner_accounts SET direccion=? WHERE direccion=?`, [newDir, oldDir]);
    this.db.run(`DELETE FROM owner_accounts WHERE direccion=?`, [oldDir]);
  }

  // Cambia la direccion dentro de las claves de marks ("a|DIR|m|y", "v|DIR"...). Si dos
  // direcciones viejas caen en la misma nueva, se queda la marca mas reciente.
  _rekeyMarks(map) {
    const toDate = d => { const p = String(d || '').split('/'); return p.length === 3 ? `${p[2]}${p[1]}${p[0]}` : ''; };
    const out = {};
    for (const r of this.all('SELECT key, data FROM marks')) {
      const parts = r.key.split('|');
      if (map.has(parts[1])) parts[1] = map.get(parts[1]);
      const k = parts.join('|');
      const data = JSON.parse(r.data);
      if (!out[k] || toDate(data.date) > toDate(out[k].date)) out[k] = data;
    }
    this.db.run('DELETE FROM marks');
    for (const [k, v] of Object.entries(out)) this.db.run('INSERT INTO marks (key, data) VALUES (?, ?)', [k, JSON.stringify(v)]);
  }

  // Borra contratos inactivos sin ningun dato de contacto del propietario (ni telefono,
  // ni mail, ni contacto), y los propietarios que quedan sin aptos por eso.
  purgeInactiveWithoutContact() {
    const owners = new Map(this.listOwners().map(o => [o.id, o]));
    const links = this.listContractOwners();
    const byContract = new Map();
    for (const l of links) { if (!byContract.has(l.contractId)) byContract.set(l.contractId, []); byContract.get(l.contractId).push(owners.get(l.ownerId)); }
    const toDelete = this.listContracts().filter(c => c.inactive &&
      !(byContract.get(c.id) || []).some(o => o && (o.telefono || o.mail || o.contactId)));
    if (!toDelete.length) return [];
    const affected = new Set(toDelete.flatMap(c => (byContract.get(c.id) || []).map(o => o && o.id)).filter(Boolean));
    this.transaction(() => {
      for (const c of toDelete) {
        this.db.run('DELETE FROM contract_owners WHERE contract_id=?', [c.id]);
        this.db.run('DELETE FROM contracts WHERE id=?', [c.id]);
      }
      for (const oid of affected) {
        if (!this.all('SELECT 1 FROM contract_owners WHERE owner_id=?', [oid]).length) this.db.run('DELETE FROM owners WHERE id=?', [oid]);
      }
    });
    return toDelete.map(c => `${c.direccion}${c.propietario ? ` (${c.propietario})` : ''}`);
  }

  setTenantNames(list) {
    this.transaction(() => { for (const t of list) this.db.run('UPDATE contracts SET inquilino=? WHERE id=?', [s(t.inquilino), t.id]); });
  }

  // Aplica direcciones normalizadas: [{id, edificio, calle, unidad, direccion}].
  applyAddresses(list) {
    return this.transaction(() => {
      const byId = new Map(this.listContracts().map(c => [c.id, c]));
      const map = new Map();
      for (const a of list) {
        const old = byId.get(a.id);
        if (!old) continue;
        this.db.run(`UPDATE contracts SET edificio=?, calle=?, unidad=?, direccion=?,
          direccion_original=CASE WHEN direccion_original='' THEN direccion ELSE direccion_original END WHERE id=?`,
          [s(a.edificio), s(a.calle), s(a.unidad), s(a.direccion), a.id]);
        if (old.direccion !== a.direccion) map.set(old.direccion, a.direccion);
      }
      this._rekeyMarks(map);
      return map.size;
    });
  }

  addContract(c) {
    const id = this.transaction(() => this._insertContract({ ...c, importe: c.importeBase, inactive: false }));
    return this.getContract(id);
  }

  // Edicion completa desde el modal. Igual que la app original: el importe
  // ingresado pasa a ser tanto el base como el actual.
  updateContract(id, c) {
    const prev = this.getContract(id);
    if (!prev) throw new Error('Alquiler inexistente.');
    const imp = n(c.importeBase);
    if (!s(c.direccion)) throw new Error('La direccion es obligatoria.');
    if (!imp || imp <= 0) throw new Error('El importe es obligatorio.');
    this.transaction(() => {
      this.db.run(
        `UPDATE contracts SET direccion=?, propietario=?, tel_prop=?, mail_prop=?, importe_base=?,
          importe=?, contrato_str=?, fecha_inicio=?, inquilino=?, tel_inq=?, mail_inq=?, notas=?,
          edificio=?, calle=?, unidad=?, garantia=?, remitente=?, moneda=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [s(c.direccion), s(c.propietario), s(c.telProp), s(c.mailProp), imp, imp, s(c.contratoStr),
         c.fechaInicio || null, s(c.inquilino), s(c.telInq), s(c.mailInq), s(c.notas),
         s(c.edificio), s(c.calle), s(c.unidad),
         c.garantia === undefined ? prev.garantia : s(c.garantia),
         c.remitente === undefined ? prev.remitente : s(c.remitente),
         c.moneda === undefined ? prev.moneda : (c.moneda === 'USD' ? 'USD' : 'UYU'), id]);
      this._renameDireccionRefs(prev.direccion, s(c.direccion));
    });
    return this.getContract(id);
  }

  patchContract(id, fields) {
    if (!this.getContract(id)) throw new Error('Alquiler inexistente.');
    const keys = Object.keys(fields).filter(k => PATCHABLE.has(k));
    if (!keys.length) return this.getContract(id);
    const sets = keys.map(k => `${CONTRACT_COLS[k]} = ?`).join(', ');
    const vals = keys.map(k => k === 'importe' ? n(fields[k]) : (k === 'notas' ? s(fields[k]) : (fields[k] || null)));
    this.transaction(() => this.db.run(
      `UPDATE contracts SET ${sets}, updated_at=datetime('now','localtime') WHERE id = ?`, [...vals, id]));
    return this.getContract(id);
  }

  // CGN / ANDA estaban cargados como "remitente": pasan a ser la garantia. Los demas
  // remitentes (quien hace los aumentos) quedan con el nombre formateado.
  migrateGarantias(fmtName) {
    let n = 0;
    this.transaction(() => {
      for (const c of this.listContracts()) {
        const r = s(c.remitente), up = r.toUpperCase();
        if (['CGN', 'ANDA'].includes(up)) {
          this.db.run("UPDATE contracts SET garantia=?, remitente='' WHERE id=?", [c.garantia || up, c.id]); n++;
        } else if (r && fmtName && fmtName(r) !== r) {
          this.db.run('UPDATE contracts SET remitente=? WHERE id=?', [fmtName(r), c.id]); n++;
        }
      }
    });
    return n;
  }

  // Alquileres en dolares: los importes de hasta 4 cifras (en pesos arrancan en 5 cifras).
  migrateMoneda() {
    this.transaction(() => this.db.run("UPDATE contracts SET moneda='USD' WHERE importe > 0 AND importe < 10000 AND moneda='UYU'"));
  }

  setInactive(id) {
    if (!this.getContract(id)) throw new Error('Alquiler inexistente.');
    this.transaction(() => this.db.run(
      `UPDATE contracts SET inactive=1, updated_at=datetime('now','localtime') WHERE id=?`, [id]));
    return this.getContract(id);
  }

  // ── administraciones ─────────────────────────────────────────────────────
  listAdmins() { return this.all('SELECT id, nombre, edificios, telefono, mail FROM admins ORDER BY id'); }

  saveAdmin(a) {
    if (!s(a.nombre)) throw new Error('El nombre de la administracion es obligatorio.');
    const vals = [s(a.nombre), s(a.edificios), s(a.telefono), s(a.mail)];
    return this.transaction(() => {
      if (a.id != null) {
        this.db.run('UPDATE admins SET nombre=?, edificios=?, telefono=?, mail=? WHERE id=?', [...vals, a.id]);
        return a.id;
      }
      this.db.run('INSERT INTO admins (nombre, edificios, telefono, mail) VALUES (?,?,?,?)', vals);
      return this.lastId();
    });
  }

  deleteAdmin(id) { this.transaction(() => this.db.run('DELETE FROM admins WHERE id=?', [id])); }

  // ── marks ────────────────────────────────────────────────────────────────
  getMarks() {
    const out = {};
    for (const r of this.all('SELECT key, data FROM marks')) {
      try { out[r.key] = JSON.parse(r.data); } catch (_) {}
    }
    return out;
  }

  replaceMarks(marks) {
    this.transaction(() => {
      this.db.run('DELETE FROM marks');
      const st = this.db.prepare('INSERT INTO marks (key, data) VALUES (?, ?)');
      try { for (const [k, v] of Object.entries(marks || {})) st.run([k, JSON.stringify(v)]); }
      finally { st.free(); }
    });
  }

  // ── settings ─────────────────────────────────────────────────────────────
  getSettings() {
    const out = {};
    for (const r of this.all('SELECT key, value FROM settings')) out[r.key] = r.value;
    return out;
  }
  setSetting(key, value) {
    this.transaction(() => this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, value == null ? null : String(value)]));
  }

  // ── importacion desde Excel (reemplaza contratos y administraciones) ─────
  importData({ contracts, admins }) {
    return this.transaction(() => {
      this.db.run('DELETE FROM contract_owners');
      this.db.run('DELETE FROM contracts');
      this.db.run('DELETE FROM admins');
      this.db.run("DELETE FROM sqlite_sequence WHERE name IN ('contracts','admins')");
      for (const c of contracts) this._insertContract(c);
      const st = this.db.prepare('INSERT INTO admins (nombre, edificios, telefono, mail, source_row) VALUES (?,?,?,?,?)');
      try { for (const a of admins) st.run([s(a.nombre), s(a.edificios), s(a.telefono), s(a.mail), a.sourceRow ?? null]); }
      finally { st.free(); }
      return { contracts: contracts.length, admins: admins.length };
    });
  }

  // ── propietarios y contactos ─────────────────────────────────────────────
  listOwners() {
    return this.all(`SELECT id, nombre, telefono, mail, notas, contact_id AS contactId, cedula, domicilio,
      estado_civil AS estadoCivil, cuenta_cobro AS cuentaCobro FROM owners ORDER BY nombre COLLATE NOCASE`);
  }
  listOwnerDocs() {
    return this.all('SELECT id, owner_id AS ownerId, tipo, archivo, nombre_original AS nombreOriginal, created_at AS creado FROM owner_docs ORDER BY id');
  }
  listOwnerAccounts() { return this.all('SELECT owner_id AS ownerId, direccion, cuenta FROM owner_accounts'); }

  addOwnerDoc(ownerId, tipo, archivo, nombreOriginal) {
    this.transaction(() => this.db.run('INSERT INTO owner_docs (owner_id, tipo, archivo, nombre_original) VALUES (?,?,?,?)',
      [ownerId, s(tipo) || 'cedula', archivo, s(nombreOriginal)]));
  }
  getOwnerDoc(id) {
    const [d] = this.all('SELECT id, owner_id AS ownerId, archivo, nombre_original AS nombreOriginal FROM owner_docs WHERE id=?', [id]);
    return d || null;
  }
  deleteOwnerDoc(id) { this.transaction(() => this.db.run('DELETE FROM owner_docs WHERE id=?', [id])); }

  // Cuenta / metodo de cobro de un propietario para un apto puntual ('' la borra).
  setOwnerAccount(ownerId, direccion, cuenta) {
    this.transaction(() => {
      if (!s(cuenta)) this.db.run('DELETE FROM owner_accounts WHERE owner_id=? AND direccion=?', [ownerId, direccion]);
      else this.db.run(`INSERT INTO owner_accounts (owner_id, direccion, cuenta) VALUES (?,?,?)
        ON CONFLICT(owner_id, direccion) DO UPDATE SET cuenta=excluded.cuenta`, [ownerId, direccion, s(cuenta)]);
    });
  }
  listContacts() { return this.all('SELECT id, nombre, rol, telefono, mail, notas FROM contacts ORDER BY nombre COLLATE NOCASE'); }
  listContractOwners() {
    return this.all('SELECT contract_id AS contractId, owner_id AS ownerId, orden FROM contract_owners ORDER BY contract_id, orden');
  }

  _contactExists(id) { return id == null || this.all('SELECT 1 FROM contacts WHERE id=?', [id]).length > 0; }

  saveOwner(o) {
    if (!s(o.nombre)) throw new Error('El nombre del propietario es obligatorio.');
    const contactId = o.contactId ? Number(o.contactId) : null;
    if (!this._contactExists(contactId)) throw new Error('Contacto inexistente.');
    const vals = [s(o.nombre), s(o.telefono), s(o.mail), s(o.notas), contactId,
                  s(o.cedula), s(o.domicilio), s(o.estadoCivil), s(o.cuentaCobro)];
    return this.transaction(() => {
      if (o.id != null) {
        this.db.run(`UPDATE owners SET nombre=?, telefono=?, mail=?, notas=?, contact_id=?, cedula=?, domicilio=?,
          estado_civil=?, cuenta_cobro=? WHERE id=?`, [...vals, o.id]);
        return o.id;
      }
      this.db.run(`INSERT INTO owners (nombre, telefono, mail, notas, contact_id, cedula, domicilio, estado_civil, cuenta_cobro)
        VALUES (?,?,?,?,?,?,?,?,?)`, vals);
      return this.lastId();
    });
  }

  deleteOwner(id) { this.transaction(() => this.db.run('DELETE FROM owners WHERE id=?', [id])); }

  saveContact(c) {
    if (!s(c.nombre)) throw new Error('El nombre del contacto es obligatorio.');
    const vals = [s(c.nombre), s(c.rol), s(c.telefono), s(c.mail), s(c.notas)];
    return this.transaction(() => {
      if (c.id != null) { this.db.run('UPDATE contacts SET nombre=?, rol=?, telefono=?, mail=?, notas=? WHERE id=?', [...vals, c.id]); return c.id; }
      this.db.run('INSERT INTO contacts (nombre, rol, telefono, mail, notas) VALUES (?,?,?,?,?)', vals);
      return this.lastId();
    });
  }

  deleteContact(id) { this.transaction(() => this.db.run('DELETE FROM contacts WHERE id=?', [id])); }

  // Une "drop" dentro de "keep": pasa los aptos, completa datos vacios y suma notas.
  mergeOwners(keepId, dropId) {
    if (keepId === dropId) throw new Error('No se puede unificar un propietario consigo mismo.');
    const [keep] = this.all('SELECT * FROM owners WHERE id=?', [keepId]);
    const [drop] = this.all('SELECT * FROM owners WHERE id=?', [dropId]);
    if (!keep || !drop) throw new Error('Propietario inexistente.');
    const notas = [keep.notas, drop.notas, `Unificado con: ${drop.nombre}`].filter(x => x && x.trim()).join('\n');
    this.transaction(() => {
      this.db.run(`INSERT OR IGNORE INTO contract_owners (contract_id, owner_id, orden)
                   SELECT contract_id, ?, orden FROM contract_owners WHERE owner_id=?`, [keepId, dropId]);
      this.db.run(`INSERT OR IGNORE INTO owner_accounts (owner_id, direccion, cuenta)
                   SELECT ?, direccion, cuenta FROM owner_accounts WHERE owner_id=?`, [keepId, dropId]);
      this.db.run('UPDATE owner_docs SET owner_id=? WHERE owner_id=?', [keepId, dropId]);
      this.db.run(`UPDATE owners SET telefono=?, mail=?, notas=?, contact_id=?, cedula=?, domicilio=?,
        estado_civil=?, cuenta_cobro=? WHERE id=?`,
        [keep.telefono || drop.telefono, keep.mail || drop.mail, notas, keep.contact_id ?? drop.contact_id,
         keep.cedula || drop.cedula, keep.domicilio || drop.domicilio, keep.estado_civil || drop.estado_civil,
         keep.cuenta_cobro || drop.cuenta_cobro, keepId]);
      this.db.run('DELETE FROM owners WHERE id=?', [dropId]);
    });
  }

  setContractOwners(contractId, ownerIds) {
    this.transaction(() => this._setContractOwners(contractId, ownerIds));
  }
  _setContractOwners(contractId, ownerIds) {
    this.db.run('DELETE FROM contract_owners WHERE contract_id=?', [contractId]);
    [...new Set(ownerIds)].forEach((oid, i) =>
      this.db.run('INSERT INTO contract_owners (contract_id, owner_id, orden) VALUES (?,?,?)', [contractId, oid, i]));
  }

  // Vincula un contrato a partir del texto del modal ("A / B"): reutiliza propietarios
  // existentes por nombre y crea los que falten (con tel/mail si es uno solo).
  linkOwnersFromText(contractId, text, telefono, mail, nameKey) {
    const names = String(text || '').split(/\s*\/{1,}\s*/).map(x => x.trim()).filter(Boolean);
    const existing = this.listOwners();
    this.transaction(() => {
      const ids = names.map(n => {
        const found = existing.find(o => nameKey(o.nombre) === nameKey(n));
        if (found) {
          if (names.length === 1 && (!found.telefono || !found.mail)) {
            this.db.run('UPDATE owners SET telefono=?, mail=? WHERE id=?',
              [found.telefono || s(telefono), found.mail || s(mail), found.id]);
          }
          return found.id;
        }
        this.db.run('INSERT INTO owners (nombre, telefono, mail) VALUES (?,?,?)',
          [n, names.length === 1 ? s(telefono) : '', names.length === 1 ? s(mail) : '']);
        return this.lastId();
      });
      this._setContractOwners(contractId, ids);
    });
  }

  // Aplica el plan del unificador (reemplaza propietarios, contactos y vinculos).
  applyOwnersPlan(plan) {
    // Los datos cargados a mano (cedula, documentos, cuentas...) se conservan por nombre.
    const prevOwners = new Map(this.all('SELECT * FROM owners').map(o => [nameKey(o.nombre), o]));
    const prevDocs = this.all('SELECT * FROM owner_docs');
    const prevAccounts = this.all('SELECT * FROM owner_accounts');
    return this.transaction(() => {
      this.db.run('DELETE FROM contract_owners');
      this.db.run('DELETE FROM owners');
      this.db.run('DELETE FROM contacts');
      const contactIds = new Map();
      for (const c of plan.contacts) {
        this.db.run('INSERT INTO contacts (nombre, rol, telefono, mail, notas) VALUES (?,?,?,?,?)',
          [c.nombre, c.rol, c.telefono, c.mail, c.notas]);
        contactIds.set(c.key, this.lastId());
      }
      const ownerIds = new Map();
      for (const o of plan.owners) {
        this.db.run('INSERT INTO owners (nombre, telefono, mail, notas, contact_id) VALUES (?,?,?,?,?)',
          [o.nombre, o.telefono, o.mail, o.notas, o.contactKey ? contactIds.get(o.contactKey) : null]);
        ownerIds.set(o.key, this.lastId());
      }
      for (const l of plan.links) {
        this.db.run('INSERT OR IGNORE INTO contract_owners (contract_id, owner_id, orden) VALUES (?,?,?)',
          [l.contractId, ownerIds.get(l.ownerKey), l.orden]);
      }
      const newIdByName = new Map(plan.owners.map(o => [nameKey(o.nombre), ownerIds.get(o.key)]));
      const oldToNew = new Map();
      for (const [k, old] of prevOwners) {
        const nid = newIdByName.get(k);
        if (!nid) continue;
        oldToNew.set(old.id, nid);
        this.db.run(`UPDATE owners SET cedula=?, domicilio=?, estado_civil=?, cuenta_cobro=? WHERE id=?`,
          [old.cedula || '', old.domicilio || '', old.estado_civil || '', old.cuenta_cobro || '', nid]);
      }
      for (const d of prevDocs) if (oldToNew.has(d.owner_id)) {
        this.db.run('INSERT INTO owner_docs (owner_id, tipo, archivo, nombre_original, created_at) VALUES (?,?,?,?,?)',
          [oldToNew.get(d.owner_id), d.tipo, d.archivo, d.nombre_original, d.created_at]);
      }
      for (const a of prevAccounts) if (oldToNew.has(a.owner_id)) {
        this.db.run('INSERT OR IGNORE INTO owner_accounts (owner_id, direccion, cuenta) VALUES (?,?,?)',
          [oldToNew.get(a.owner_id), a.direccion, a.cuenta]);
      }
      return { owners: plan.owners.length, contacts: plan.contacts.length, links: plan.links.length };
    });
  }

  // ── exportacion ──────────────────────────────────────────────────────────
  exportTables() {
    const ownersByContract = new Map(), contractsByOwner = new Map();
    const owners = new Map(this.listOwners().map(o => [o.id, o]));
    const contracts = this.listContracts();
    const cById = new Map(contracts.map(c => [c.id, c]));
    for (const l of this.listContractOwners()) {
      if (!ownersByContract.has(l.contractId)) ownersByContract.set(l.contractId, []);
      ownersByContract.get(l.contractId).push(owners.get(l.ownerId).nombre);
      if (!contractsByOwner.has(l.ownerId)) contractsByOwner.set(l.ownerId, new Set());
      contractsByOwner.get(l.ownerId).add(cById.get(l.contractId).direccion);
    }
    const contacts = new Map(this.listContacts().map(c => [c.id, c]));
    const accounts = new Map();
    for (const a of this.listOwnerAccounts()) {
      if (!accounts.has(a.ownerId)) accounts.set(a.ownerId, []);
      accounts.get(a.ownerId).push(`${a.direccion}: ${a.cuenta}`);
    }
    return {
      alquileres: contracts.map(c => ({
        id: c.id, direccion: c.direccion, propietarios: (ownersByContract.get(c.id) || []).join(' / '),
        moneda: c.moneda, importe_base: c.importeBase, importe_actual: c.importe, ultimo_aumento: c.ultimoAumento || '',
        garantia: c.garantia, aumentos_los_hace: c.remitente, contrato: c.contratoStr, fecha_inicio: c.fechaInicio || '',
        inquilino: c.inquilino, tel_inquilino: c.telInq, mail_inquilino: c.mailInq,
        comentarios: c.notas, estado: c.inactive ? 'INACTIVO' : 'ACTIVO',
      })),
      propietarios: [...owners.values()].map(o => ({
        id: o.id, nombre: o.nombre, cedula: o.cedula, domicilio: o.domicilio, estado_civil: o.estadoCivil,
        celular: o.telefono, mail: o.mail,
        contacto: o.contactId ? `${contacts.get(o.contactId).nombre} (${contacts.get(o.contactId).rol})` : '',
        cuenta_cobro: o.cuentaCobro, cuentas_por_apto: (accounts.get(o.id) || []).join(' | '), notas: o.notas,
        aptos: [...(contractsByOwner.get(o.id) || [])].join(' | '),
      })),
      contactos: [...contacts.values()],
      administraciones: this.listAdmins(),
    };
  }

  close() { this.db.close(); }
}

module.exports = { Store };
