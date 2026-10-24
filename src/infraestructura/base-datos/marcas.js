// Marcas (aumento enviado, renovado, no renueva...), guardadas por direccion.
class MetodosMarcas {
  // ── marks ────────────────────────────────────────────────────────────────
  obtenerMarcas() {
    const salida = {};
    for (const r of this.consultar('SELECT key, data FROM marks')) {
      try { salida[r.key] = JSON.parse(r.data); } catch (_) {}
    }
    return salida;
  }

  reemplazarMarcas(marks) {
    this.transaccion(() => {
      this.db.run('DELETE FROM marks');
      const st = this.db.prepare('INSERT INTO marks (key, data) VALUES (?, ?)');
      try { for (const [k, v] of Object.entries(marks || {})) st.run([k, JSON.stringify(v)]); }
      finally { st.free(); }
    });
  }
}

module.exports = { MetodosMarcas };
