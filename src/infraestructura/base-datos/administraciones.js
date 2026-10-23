// Administraciones de edificios.
const { s } = require('./util');
class MetodosAdministraciones {
  // ── administraciones ─────────────────────────────────────────────────────
  listAdmins() { return this.all('SELECT id, nombre, edificios, telefono, mail FROM admins ORDER BY id'); }

  saveAdmin(a) {
    if (!s(a.nombre)) throw new Error('El nombre de la administracion es obligatorio.');
    const vals = [s(a.nombre), s(a.edificios), s(a.telefono), s(a.mail)];
    return this.transaction(() => {
      if (a.id != null) {
        this.db.run('UPDATE admins SET nombre=?, edificios=?, telefono=?, mail=? WHERE id=?', [...vals, a.id]);
        return a.id;
      }
      this.db.run('INSERT INTO admins (nombre, edificios, telefono, mail) VALUES (?,?,?,?)', vals);
      return this.lastId();
    });
  }

  deleteAdmin(id) { this.transaction(() => this.db.run('DELETE FROM admins WHERE id=?', [id])); }
}

module.exports = { MetodosAdministraciones };
