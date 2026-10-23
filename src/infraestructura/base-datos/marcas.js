// Marcas (aumento enviado, renovado, no renueva...), guardadas por direccion.
class MetodosMarcas {
  // ── marks ────────────────────────────────────────────────────────────────
  getMarks() {
    const out = {};
    for (const r of this.all('SELECT key, data FROM marks')) {
      try { out[r.key] = JSON.parse(r.data); } catch (_) {}
    }
    return out;
  }

  replaceMarks(marks) {
    this.transaction(() => {
      this.db.run('DELETE FROM marks');
      const st = this.db.prepare('INSERT INTO marks (key, data) VALUES (?, ?)');
      try { for (const [k, v] of Object.entries(marks || {})) st.run([k, JSON.stringify(v)]); }
      finally { st.free(); }
    });
  }
}

module.exports = { MetodosMarcas };
