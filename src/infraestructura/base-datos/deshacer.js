// Deshacer / rehacer: copias de la base antes de cada cambio.
const UNDO_LIMIT = 40;
const UNDO_GROUP_MS = 1500;

class MetodosDeshacer {
  // ── deshacer / rehacer ───────────────────────────────────────────────────
  // Guarda una copia de la base antes de un cambio. Cambios seguidos (< 1,5 s) se agrupan
  // en un solo paso, ej. "marcar enviado" = importe + marca; agrupar=false para cambios grandes
  // (importaciones) que siempre son un paso propio: ni se juntan con el anterior ni el siguiente
  // se junta con ellos (t = 0).
  checkpoint(label, agrupar = true) {
    const now = Date.now();
    const last = this.undoStack[this.undoStack.length - 1];
    if (agrupar && last && last.t && now - last.t < UNDO_GROUP_MS) { last.t = now; return false; }
    this.undoStack.push({ label, t: agrupar ? now : 0, data: this.db.export() });
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
}

module.exports = { MetodosDeshacer };
