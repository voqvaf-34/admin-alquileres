// Configuracion (tabla settings): clave y valor.
class MetodosAjustes {
  // ── settings ─────────────────────────────────────────────────────────────
  obtenerAjustes() {
    const out = {};
    for (const r of this.consultar('SELECT key, value FROM settings')) out[r.key] = r.value;
    return out;
  }
  guardarAjuste(key, value) {
    this.guardarAjustes({ [key]: value });
  }
  // Varias claves en una sola transaccion (un solo guardado y una sola publicacion).
  guardarAjustes(values) {
    this.transaccion(() => {
      for (const [key, value] of Object.entries(values)) this.db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        [key, value == null ? null : String(value)]);
    });
  }
}

module.exports = { MetodosAjustes };
