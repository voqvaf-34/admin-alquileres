// Marcas (aumento enviado, renovado, no renueva...), guardadas por direccion.
class MetodosMarcas {
  // ── marks ────────────────────────────────────────────────────────────────
  obtenerMarcas() {
    const salida = {};
    for (const r of this.consultar('SELECT clave, datos FROM marcas')) {
      try { salida[r.clave] = JSON.parse(r.datos); } catch (_) {}
    }
    return salida;
  }

  reemplazarMarcas(marks) {
    this.transaccion(() => {
      this.db.run('DELETE FROM marcas');
      const st = this.db.prepare('INSERT INTO marcas (clave, datos) VALUES (?, ?)');
      try { for (const [k, v] of Object.entries(marks || {})) st.run([k, JSON.stringify(v)]); }
      finally { st.free(); }
    });
  }
}

module.exports = { MetodosMarcas };
