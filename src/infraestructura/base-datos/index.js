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
  static async open(rutaArchivo, opciones = {}) {
    const SQL = await initSqlJs({
      wasmBinary: fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')),
    });
    const existe = fs.existsSync(rutaArchivo);
    if (opciones.readOnly && !existe) throw new Error('No se encontro la base compartida en ' + rutaArchivo);
    const db = existe ? new SQL.Database(fs.readFileSync(rutaArchivo)) : new SQL.Database();
    const store = new BaseDatos(db, rutaArchivo, opciones);
    store.SQL = SQL;
    db.run('PRAGMA foreign_keys = ON;');
    db.exec(ESQUEMA);
    store.agregarColumnasFaltantes();
    if (!existe) store.persistir();
    return store;
  }

  constructor(db, rutaArchivo, opciones) {
    this.db = db;
    this.filePath = rutaArchivo;
    this.backupDir = opciones.backupDir || path.join(path.dirname(rutaArchivo), 'backups');
    this.maxBackups = opciones.maxBackups || 20;
    this.undoStack = [];
    this.redoStack = [];
    // Modo visor: la base se lee de la carpeta compartida y nunca se escribe.
    this.readOnly = !!opciones.readOnly;
    this.onPersist = null;
    this.saveStatus = { ok: true, at: null, error: null };
  }

  agregarColumnasFaltantes() {
    let cambiado = false;
    for (const [tabla, col, def] of COLUMNAS_AGREGADAS) {
      const cols = this.consultar(`PRAGMA table_info(${tabla})`).map(r => r.name);
      if (!cols.includes(col)) { this.db.run(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${def}`); cambiado = true; }
    }
    if (cambiado) this.persistir();
  }

  // ── infraestructura ──────────────────────────────────────────────────────
  persistir() {
    if (this.readOnly) return;
    const datos = Buffer.from(this.db.export());
    // sql.js reinicia la conexion en export() y se pierden los PRAGMA.
    this.db.run('PRAGMA foreign_keys = ON;');
    const tmp  = this.filePath + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tmp, datos);
      fs.renameSync(tmp, this.filePath);
      this.saveStatus = { ok: true, at: new Date().toISOString(), error: null };
    } catch (e) {
      this.saveStatus = { ok: false, at: this.saveStatus.at, error: e.message };
      throw e;
    }
    if (this.onPersist) this.onPersist();
  }

  respaldar(etiqueta) {
    if (this.readOnly || !fs.existsSync(this.filePath)) return null;
    fs.mkdirSync(this.backupDir, { recursive: true });
    const marcaTiempo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest  = path.join(this.backupDir, `alquileres-${marcaTiempo}${etiqueta ? '-' + etiqueta : ''}.sqlite`);
    fs.copyFileSync(this.filePath, dest);
    const archivos = fs.readdirSync(this.backupDir).filter(f => f.endsWith('.sqlite')).sort();
    for (const f of archivos.slice(0, Math.max(0, archivos.length - this.maxBackups))) {
      try { fs.unlinkSync(path.join(this.backupDir, f)); } catch (_) {}
    }
    return dest;
  }

  consultar(sql, params = []) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const filas = [];
      while (st.step()) filas.push(st.getAsObject());
      return filas;
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
