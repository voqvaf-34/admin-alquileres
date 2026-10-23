// Base de datos (SQLite en memoria con sql.js, guardada a disco en cada cambio).
// BaseDatos reune los metodos de cada tema (un archivo por tema en esta carpeta).
const fs   = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { COLUMNAS_AGREGADAS, ESQUEMA } = require('./esquema');
const { MetodosAdministraciones } = require('./administraciones');
const { MetodosAjustes } = require('./ajustes');
const { MetodosContratos } = require('./contratos');
const { MetodosDeshacer } = require('./deshacer');
const { MetodosExportacion } = require('./exportacion');
const { MetodosImportacion } = require('./importacion');
const { MetodosMarcas } = require('./marcas');
const { MetodosPropietarios } = require('./propietarios');

class BaseDatos {
  static async open(filePath, opts = {}) {
    const SQL = await initSqlJs({
      wasmBinary: fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')),
    });
    const exists = fs.existsSync(filePath);
    if (opts.readOnly && !exists) throw new Error('No se encontro la base compartida en ' + filePath);
    const db = exists ? new SQL.Database(fs.readFileSync(filePath)) : new SQL.Database();
    const store = new BaseDatos(db, filePath, opts);
    store.SQL = SQL;
    db.run('PRAGMA foreign_keys = ON;');
    db.exec(ESQUEMA);
    store.agregarColumnasFaltantes();
    if (!exists) store.persistir();
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

  agregarColumnasFaltantes() {
    let changed = false;
    for (const [table, col, def] of COLUMNAS_AGREGADAS) {
      const cols = this.consultar(`PRAGMA table_info(${table})`).map(r => r.name);
      if (!cols.includes(col)) { this.db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); changed = true; }
    }
    if (changed) this.persistir();
  }

  // ── infraestructura ──────────────────────────────────────────────────────
  persistir() {
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

  respaldar(tag) {
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

  consultar(sql, params = []) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally { st.free(); }
  }

  transaccion(fn) {
    this.db.run('BEGIN');
    try { const r = fn(); this.db.run('COMMIT'); this.persistir(); return r; }
    catch (e) { this.db.run('ROLLBACK'); throw e; }
  }

  ultimoId() { return this.consultar('SELECT last_insert_rowid() AS id')[0].id; }

  close() { this.db.close(); }
}

// Suma a BaseDatos los metodos de cada tema (mismas propiedades que si estuvieran en la clase).
for (const Metodos of [MetodosDeshacer, MetodosContratos, MetodosAdministraciones, MetodosMarcas, MetodosAjustes,
  MetodosImportacion, MetodosPropietarios, MetodosExportacion]) {
  for (const nombre of Object.getOwnPropertyNames(Metodos.prototype)) {
    if (nombre === 'constructor') continue;
    if (Object.prototype.hasOwnProperty.call(BaseDatos.prototype, nombre)) throw new Error('Metodo repetido en BaseDatos: ' + nombre);
    Object.defineProperty(BaseDatos.prototype, nombre, Object.getOwnPropertyDescriptor(Metodos.prototype, nombre));
  }
}

module.exports = { BaseDatos };
