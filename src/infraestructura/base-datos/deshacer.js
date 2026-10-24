// Deshacer / rehacer: copias de la base antes de cada cambio.
const LIMITE_DESHACER = 40;
const DESHACER_AGRUPAR_MS = 1500;

class MetodosDeshacer {
  // ── deshacer / rehacer ───────────────────────────────────────────────────
  // Guarda una copia de la base antes de un cambio. Cambios seguidos (< 1,5 s) se agrupan
  // en un solo paso, ej. "marcar enviado" = importe + marca; agrupar=false para cambios grandes
  // (importaciones) que siempre son un paso propio: ni se juntan con el anterior ni el siguiente
  // se junta con ellos (t = 0).
  puntoDeControl(etiqueta, agrupar = true) {
    const ahora = Date.now();
    const ultimo = this.pilaDeshacer[this.pilaDeshacer.length - 1];
    if (agrupar && ultimo && ultimo.t && ahora - ultimo.t < DESHACER_AGRUPAR_MS) { ultimo.t = ahora; return false; }
    this.pilaDeshacer.push({ etiqueta, t: agrupar ? ahora : 0, datos: this.db.export() });
    this.db.run('PRAGMA foreign_keys = ON;');
    if (this.pilaDeshacer.length > LIMITE_DESHACER) this.pilaDeshacer.shift();
    this.pilaRehacer = [];
    return true;
  }
  descartarPuntoDeControl() { this.pilaDeshacer.pop(); }

  _cargarCopia(datos) {
    this.db.close();
    this.db = new this.SQL.Database(datos);
    this.db.run('PRAGMA foreign_keys = ON;');
    this.persistir();
  }
  deshacerCambio() {
    const anterior = this.pilaDeshacer.pop();
    if (!anterior) throw new Error('No hay cambios para deshacer.');
    this.pilaRehacer.push({ etiqueta: anterior.etiqueta, datos: this.db.export() });
    this._cargarCopia(anterior.datos);
    return anterior.etiqueta;
  }
  rehacerCambio() {
    const siguiente = this.pilaRehacer.pop();
    if (!siguiente) throw new Error('No hay cambios para rehacer.');
    this.pilaDeshacer.push({ etiqueta: siguiente.etiqueta, t: 0, datos: this.db.export() });
    this._cargarCopia(siguiente.datos);
    return siguiente.etiqueta;
  }
  estadoDeshacer() {
    const u = this.pilaDeshacer[this.pilaDeshacer.length - 1], r = this.pilaRehacer[this.pilaRehacer.length - 1];
    return { puedeDeshacer: !!u, etiquetaDeshacer: u ? u.etiqueta : '', puedeRehacer: !!r, etiquetaRehacer: r ? r.etiqueta : '' };
  }
}

module.exports = { MetodosDeshacer };
