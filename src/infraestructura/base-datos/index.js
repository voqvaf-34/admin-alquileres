// Base de datos (SQLite en memoria con sql.js, guardada a disco en cada cambio).
// BaseDatos reune los metodos de cada tema (un archivo por tema en esta carpeta).
const fs   = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { CAMPOS_MARCA_VIEJOS, CLAVES_VIEJAS, COLUMNAS_AGREGADAS, COLUMNAS_VIEJAS, ESQUEMA, TABLAS_VIEJAS } = require('./esquema');
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
    if (opciones.soloLectura && !existe) throw new Error('No se encontro la base compartida en ' + rutaArchivo);
    const db = existe ? new SQL.Database(fs.readFileSync(rutaArchivo)) : new SQL.Database();
    const store = new BaseDatos(db, rutaArchivo, opciones);
    store.SQL = SQL;
    const migrada = store.renombrarTablasViejas();
    db.run('PRAGMA foreign_keys = ON;');
    db.exec(ESQUEMA);
    store.agregarColumnasFaltantes();
    if (!existe || migrada) store.persistir();
    return store;
  }

  constructor(db, rutaArchivo, opciones) {
    this.db = db;
    this.rutaArchivo = rutaArchivo;
    this.carpetaRespaldos = opciones.carpetaRespaldos || path.join(path.dirname(rutaArchivo), 'backups');
    this.maxRespaldos = opciones.maxRespaldos || 20;
    this.pilaDeshacer = [];
    this.pilaRehacer = [];
    // Modo visor: la base se lee de la carpeta compartida y nunca se escribe.
    this.soloLectura = !!opciones.soloLectura;
    this.alPersistir = null;
    this.estadoGuardado = { ok: true, at: null, error: null };
  }

  // Bases de hasta la 0.8.1 (tablas y columnas en ingles): se renombran una sola vez.
  renombrarTablasViejas() {
    const tablas = new Set(this.consultar("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name));
    if (!tablas.has('contracts')) return false;
    this.db.run('PRAGMA foreign_keys = OFF;');
    this.db.run('BEGIN');
    try {
      for (const [vieja, nueva] of TABLAS_VIEJAS) if (tablas.has(vieja)) this.db.run(`ALTER TABLE ${vieja} RENAME TO ${nueva}`);
      for (const [tabla, vieja, nueva] of COLUMNAS_VIEJAS) {
        const cols = this.consultar(`PRAGMA table_info(${tabla})`).map(r => r.name);
        if (cols.includes(vieja)) this.db.run(`ALTER TABLE ${tabla} RENAME COLUMN ${vieja} TO ${nueva}`);
      }
      for (const [vieja, nueva] of CLAVES_VIEJAS) this.db.run('UPDATE ajustes SET clave=? WHERE clave=?', [nueva, vieja]);
      for (const { clave, datos } of this.consultar('SELECT clave, datos FROM marcas')) {
        let marca;
        try { marca = JSON.parse(datos); } catch (_) { continue; }
        const nueva = Object.fromEntries(Object.entries(marca).map(([k, v]) => [CAMPOS_MARCA_VIEJOS[k] || k, v]));
        this.db.run('UPDATE marcas SET datos=? WHERE clave=?', [JSON.stringify(nueva), clave]);
      }
      this.db.run('COMMIT');
    } catch (e) { this.db.run('ROLLBACK'); throw e; }
    return true;
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
    if (this.soloLectura) return;
    const datos = Buffer.from(this.db.export());
    // sql.js reinicia la conexion en export() y se pierden los PRAGMA.
    this.db.run('PRAGMA foreign_keys = ON;');
    const tmp  = this.rutaArchivo + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.rutaArchivo), { recursive: true });
      fs.writeFileSync(tmp, datos);
      fs.renameSync(tmp, this.rutaArchivo);
      this.estadoGuardado = { ok: true, at: new Date().toISOString(), error: null };
    } catch (e) {
      this.estadoGuardado = { ok: false, at: this.estadoGuardado.at, error: e.message };
      throw e;
    }
    if (this.alPersistir) this.alPersistir();
  }

  respaldar(etiqueta) {
    if (this.soloLectura || !fs.existsSync(this.rutaArchivo)) return null;
    fs.mkdirSync(this.carpetaRespaldos, { recursive: true });
    const marcaTiempo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest  = path.join(this.carpetaRespaldos, `alquileres-${marcaTiempo}${etiqueta ? '-' + etiqueta : ''}.sqlite`);
    fs.copyFileSync(this.rutaArchivo, dest);
    const archivos = fs.readdirSync(this.carpetaRespaldos).filter(f => f.endsWith('.sqlite')).sort();
    for (const f of archivos.slice(0, Math.max(0, archivos.length - this.maxRespaldos))) {
      try { fs.unlinkSync(path.join(this.carpetaRespaldos, f)); } catch (_) {}
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
