// Configuracion (tabla settings): clave y valor.
class MetodosAjustes {
  // ── settings ─────────────────────────────────────────────────────────────
  obtenerAjustes() {
    const salida = {};
    for (const r of this.consultar('SELECT key, value FROM settings')) salida[r.key] = r.value;
    return salida;
  }
  guardarAjuste(clave, valor) {
    this.guardarAjustes({ [clave]: valor });
  }
  // Varias claves en una sola transaccion (un solo guardado y una sola publicacion).
  guardarAjustes(valores) {
    this.transaccion(() => {
      for (const [clave, valor] of Object.entries(valores)) this.db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        [clave, valor == null ? null : String(valor)]);
    });
  }
}

module.exports = { MetodosAjustes };
