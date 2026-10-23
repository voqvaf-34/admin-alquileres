// Administraciones de edificios.
const { s } = require('./util');
class MetodosAdministraciones {
  // ── administraciones ─────────────────────────────────────────────────────
  listarAdmins() { return this.consultar('SELECT id, nombre, edificios, telefono, mail FROM admins ORDER BY id'); }

  guardarAdmin(a) {
    if (!s(a.nombre)) throw new Error('El nombre de la administracion es obligatorio.');
    const valores = [s(a.nombre), s(a.edificios), s(a.telefono), s(a.mail)];
    return this.transaccion(() => {
      if (a.id != null) {
        this.db.run('UPDATE admins SET nombre=?, edificios=?, telefono=?, mail=? WHERE id=?', [...valores, a.id]);
        return a.id;
      }
      this.db.run('INSERT INTO admins (nombre, edificios, telefono, mail) VALUES (?,?,?,?)', valores);
      return this.ultimoId();
    });
  }

  borrarAdmin(id) { this.transaccion(() => this.db.run('DELETE FROM admins WHERE id=?', [id])); }
}

module.exports = { MetodosAdministraciones };
