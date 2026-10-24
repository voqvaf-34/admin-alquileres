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
    const ultimo = this.undoStack[this.undoStack.length - 1];
    if (agrupar && ultimo && ultimo.t && ahora - ultimo.t < DESHACER_AGRUPAR_MS) { ultimo.t = ahora; return false; }
    this.undoStack.push({ label: etiqueta, t: agrupar ? ahora : 0, data: this.db.export() });
    this.db.run('PRAGMA foreign_keys = ON;');
    if (this.undoStack.length > LIMITE_DESHACER) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }
  descartarPuntoDeControl() { this.undoStack.pop(); }

  _cargarCopia(datos) {
    this.db.close();
    this.db = new this.SQL.Database(datos);
    this.db.run('PRAGMA foreign_keys = ON;');
    this.persistir();
  }
  deshacerCambio() {
    const anterior = this.undoStack.pop();
    if (!anterior) throw new Error('No hay cambios para deshacer.');
    this.redoStack.push({ label: anterior.label, data: this.db.export() });
    this._cargarCopia(anterior.data);
    return anterior.label;
  }
  rehacerCambio() {
    const siguiente = this.redoStack.pop();
    if (!siguiente) throw new Error('No hay cambios para rehacer.');
    this.undoStack.push({ label: siguiente.label, t: 0, data: this.db.export() });
    this._cargarCopia(siguiente.data);
    return siguiente.label;
  }
  estadoDeshacer() {
    const u = this.undoStack[this.undoStack.length - 1], r = this.redoStack[this.redoStack.length - 1];
    return { canUndo: !!u, undoLabel: u ? u.label : '', canRedo: !!r, redoLabel: r ? r.label : '' };
  }
}

module.exports = { MetodosDeshacer };
