// Configuracion (tabla settings): clave y valor.
class MetodosAjustes {
  // ── settings ─────────────────────────────────────────────────────────────
  obtenerAjustes() {
    const salida = {};
    for (const r of this.consultar('SELECT clave, valor FROM ajustes')) salida[r.clave] = r.valor;
    return salida;
  }
  guardarAjuste(clave, valor) {
    this.guardarAjustes({ [clave]: valor });
  }
  // Varias claves en una sola transaccion (un solo guardado y una sola publicacion).
  guardarAjustes(valores) {
    this.transaccion(() => {
      for (const [clave, valor] of Object.entries(valores)) this.db.run(
        'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor',
        [clave, valor == null ? null : String(valor)]);
    });
  }
}

module.exports = { MetodosAjustes };
