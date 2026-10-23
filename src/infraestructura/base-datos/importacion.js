// Importar planillas: reemplazar todo o sumar a lo que ya hay.
const { s } = require('./util');
class MetodosImportacion {
  // ── importacion desde Excel (reemplaza contratos y administraciones) ─────
  importData({ contracts, admins }) {
    return this.transaction(() => {
      this.db.run('DELETE FROM contract_owners');
      this.db.run('DELETE FROM contracts');
      this.db.run('DELETE FROM admins');
      this.db.run("DELETE FROM sqlite_sequence WHERE name IN ('contracts','admins')");
      for (const c of contracts) this._insertContract(c);
      const st = this.db.prepare('INSERT INTO admins (nombre, edificios, telefono, mail, source_row) VALUES (?,?,?,?,?)');
      try { for (const a of admins) st.run([s(a.nombre), s(a.edificios), s(a.telefono), s(a.mail), a.sourceRow ?? null]); }
      finally { st.free(); }
      return { contracts: contracts.length, admins: admins.length };
    });
  }

  // Suma alquileres y administraciones de una planilla a lo que ya hay, en un solo paso.
  // Se saltean los repetidos (misma direccion, inquilino y fecha de inicio) y las administraciones
  // con un nombre que ya existe. Los propietarios se vinculan por nombre (o se crean).
  addImported({ contracts, admins = [] }, nameKey) {
    const clave = c => [nameKey(c.direccion), nameKey(c.inquilino || ''), c.fechaInicio || ''].join('|');
    const ya = new Set(this.listContracts().map(clave));
    const adminsYa = new Set(this.listAdmins().map(a => nameKey(a.nombre)));
    const res = { agregados: 0, repetidos: 0, admins: 0 };
    this.transaction(() => {
      for (const c of contracts) {
        const k = clave(c);
        if (ya.has(k)) { res.repetidos++; continue; }
        ya.add(k);
        const id = this._insertContract(c);
        if (c.propietario) this._linkOwnersFromText(id, c.propietario, c.telProp, c.mailProp, nameKey);
        res.agregados++;
      }
      for (const a of admins) {
        if (adminsYa.has(nameKey(a.nombre))) continue;
        adminsYa.add(nameKey(a.nombre));
        this.db.run('INSERT INTO admins (nombre, edificios, telefono, mail) VALUES (?,?,?,?)', [s(a.nombre), s(a.edificios), s(a.telefono), s(a.mail)]);
        res.admins++;
      }
    });
    return res;
  }
}

module.exports = { MetodosImportacion };
