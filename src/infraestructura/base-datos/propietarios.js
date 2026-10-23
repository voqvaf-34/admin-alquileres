// Propietarios, contactos, documentos, cuentas de cobro y vinculos con los alquileres.
const { claveNombre } = require('../../dominios/index.js');
const { s } = require('./util');
class MetodosPropietarios {
  // ── propietarios y contactos ─────────────────────────────────────────────
  listarPropietarios() {
    return this.consultar(`SELECT id, nombre, telefono, mail, notas, contact_id AS contactId, cedula, domicilio,
      estado_civil AS estadoCivil, cuenta_cobro AS cuentaCobro FROM owners ORDER BY nombre COLLATE NOCASE`);
  }
  listarDocsPropietarios() {
    return this.consultar('SELECT id, owner_id AS ownerId, tipo, archivo, nombre_original AS nombreOriginal, created_at AS creado FROM owner_docs ORDER BY id');
  }
  listarCuentasPropietarios() { return this.consultar('SELECT owner_id AS ownerId, direccion, cuenta FROM owner_accounts'); }

  agregarDocPropietario(ownerId, tipo, archivo, nombreOriginal) {
    this.transaccion(() => this.db.run('INSERT INTO owner_docs (owner_id, tipo, archivo, nombre_original) VALUES (?,?,?,?)',
      [ownerId, s(tipo) || 'cedula', archivo, s(nombreOriginal)]));
  }
  obtenerDocPropietario(id) {
    const [d] = this.consultar('SELECT id, owner_id AS ownerId, archivo, nombre_original AS nombreOriginal FROM owner_docs WHERE id=?', [id]);
    return d || null;
  }
  borrarDocPropietario(id) { this.transaccion(() => this.db.run('DELETE FROM owner_docs WHERE id=?', [id])); }

  // Cuenta / metodo de cobro de un propietario para un apto puntual ('' la borra).
  ponerCuentaPropietario(ownerId, direccion, cuenta) {
    this.transaccion(() => {
      if (!s(cuenta)) this.db.run('DELETE FROM owner_accounts WHERE owner_id=? AND direccion=?', [ownerId, direccion]);
      else this.db.run(`INSERT INTO owner_accounts (owner_id, direccion, cuenta) VALUES (?,?,?)
        ON CONFLICT(owner_id, direccion) DO UPDATE SET cuenta=excluded.cuenta`, [ownerId, direccion, s(cuenta)]);
    });
  }
  listarContactos() { return this.consultar('SELECT id, nombre, rol, telefono, mail, notas FROM contacts ORDER BY nombre COLLATE NOCASE'); }
  listarPropietariosDeContratos() {
    return this.consultar('SELECT contract_id AS contractId, owner_id AS ownerId, orden FROM contract_owners ORDER BY contract_id, orden');
  }

  _existeContacto(id) { return id == null || this.consultar('SELECT 1 FROM contacts WHERE id=?', [id]).length > 0; }

  guardarPropietario(o) {
    if (!s(o.nombre)) throw new Error('El nombre del propietario es obligatorio.');
    const contactId = o.contactId ? Number(o.contactId) : null;
    if (!this._existeContacto(contactId)) throw new Error('Contacto inexistente.');
    const vals = [s(o.nombre), s(o.telefono), s(o.mail), s(o.notas), contactId,
                  s(o.cedula), s(o.domicilio), s(o.estadoCivil), s(o.cuentaCobro)];
    return this.transaccion(() => {
      if (o.id != null) {
        this.db.run(`UPDATE owners SET nombre=?, telefono=?, mail=?, notas=?, contact_id=?, cedula=?, domicilio=?,
          estado_civil=?, cuenta_cobro=? WHERE id=?`, [...vals, o.id]);
        return o.id;
      }
      this.db.run(`INSERT INTO owners (nombre, telefono, mail, notas, contact_id, cedula, domicilio, estado_civil, cuenta_cobro)
        VALUES (?,?,?,?,?,?,?,?,?)`, vals);
      return this.ultimoId();
    });
  }

  borrarPropietario(id) { this.transaccion(() => this.db.run('DELETE FROM owners WHERE id=?', [id])); }

  guardarContacto(c) {
    if (!s(c.nombre)) throw new Error('El nombre del contacto es obligatorio.');
    const vals = [s(c.nombre), s(c.rol), s(c.telefono), s(c.mail), s(c.notas)];
    return this.transaccion(() => {
      if (c.id != null) { this.db.run('UPDATE contacts SET nombre=?, rol=?, telefono=?, mail=?, notas=? WHERE id=?', [...vals, c.id]); return c.id; }
      this.db.run('INSERT INTO contacts (nombre, rol, telefono, mail, notas) VALUES (?,?,?,?,?)', vals);
      return this.ultimoId();
    });
  }

  borrarContacto(id) { this.transaccion(() => this.db.run('DELETE FROM contacts WHERE id=?', [id])); }

  // Une "drop" dentro de "keep": pasa los aptos, completa datos vacios y suma notas.
  unificarPropietarios(keepId, dropId) {
    if (keepId === dropId) throw new Error('No se puede unificar un propietario consigo mismo.');
    const [keep] = this.consultar('SELECT * FROM owners WHERE id=?', [keepId]);
    const [drop] = this.consultar('SELECT * FROM owners WHERE id=?', [dropId]);
    if (!keep || !drop) throw new Error('Propietario inexistente.');
    const notas = [keep.notas, drop.notas, `Unificado con: ${drop.nombre}`].filter(x => x && x.trim()).join('\n');
    this.transaccion(() => {
      this.db.run(`INSERT OR IGNORE INTO contract_owners (contract_id, owner_id, orden)
                   SELECT contract_id, ?, orden FROM contract_owners WHERE owner_id=?`, [keepId, dropId]);
      this.db.run(`INSERT OR IGNORE INTO owner_accounts (owner_id, direccion, cuenta)
                   SELECT ?, direccion, cuenta FROM owner_accounts WHERE owner_id=?`, [keepId, dropId]);
      this.db.run('UPDATE owner_docs SET owner_id=? WHERE owner_id=?', [keepId, dropId]);
      this.db.run(`UPDATE owners SET telefono=?, mail=?, notas=?, contact_id=?, cedula=?, domicilio=?,
        estado_civil=?, cuenta_cobro=? WHERE id=?`,
        [keep.telefono || drop.telefono, keep.mail || drop.mail, notas, keep.contact_id ?? drop.contact_id,
         keep.cedula || drop.cedula, keep.domicilio || drop.domicilio, keep.estado_civil || drop.estado_civil,
         keep.cuenta_cobro || drop.cuenta_cobro, keepId]);
      this.db.run('DELETE FROM owners WHERE id=?', [dropId]);
    });
  }

  asignarPropietariosContrato(contractId, ownerIds) {
    this.transaccion(() => this._asignarPropietariosContrato(contractId, ownerIds));
  }
  _asignarPropietariosContrato(contractId, ownerIds) {
    this.db.run('DELETE FROM contract_owners WHERE contract_id=?', [contractId]);
    [...new Set(ownerIds)].forEach((oid, i) =>
      this.db.run('INSERT INTO contract_owners (contract_id, owner_id, orden) VALUES (?,?,?)', [contractId, oid, i]));
  }

  // Vincula un contrato a partir del texto del modal ("A / B"): reutiliza propietarios
  // existentes por nombre y crea los que falten (con tel/mail si es uno solo).
  vincularPropietariosDesdeTexto(contractId, text, telefono, mail, claveNombre) {
    this.transaccion(() => this._vincularPropietariosDesdeTexto(contractId, text, telefono, mail, claveNombre));
  }
  _vincularPropietariosDesdeTexto(contractId, text, telefono, mail, claveNombre) {
    const names = String(text || '').split(/\s*\/{1,}\s*/).map(x => x.trim()).filter(Boolean);
    const existing = this.listarPropietarios();
    const ids = names.map(n => {
      const found = existing.find(o => claveNombre(o.nombre) === claveNombre(n));
      if (found) {
        if (names.length === 1 && (!found.telefono || !found.mail)) {
          this.db.run('UPDATE owners SET telefono=?, mail=? WHERE id=?',
            [found.telefono || s(telefono), found.mail || s(mail), found.id]);
        }
        return found.id;
      }
      this.db.run('INSERT INTO owners (nombre, telefono, mail) VALUES (?,?,?)',
        [n, names.length === 1 ? s(telefono) : '', names.length === 1 ? s(mail) : '']);
      return this.ultimoId();
    });
    this._asignarPropietariosContrato(contractId, ids);
  }

  // Aplica el plan del unificador (reemplaza propietarios, contactos y vinculos).
  aplicarPlanPropietarios(plan) {
    // Los datos cargados a mano (cedula, documentos, cuentas...) se conservan por nombre.
    const prevOwners = new Map(this.consultar('SELECT * FROM owners').map(o => [claveNombre(o.nombre), o]));
    const prevDocs = this.consultar('SELECT * FROM owner_docs');
    const prevAccounts = this.consultar('SELECT * FROM owner_accounts');
    return this.transaccion(() => {
      this.db.run('DELETE FROM contract_owners');
      this.db.run('DELETE FROM owners');
      this.db.run('DELETE FROM contacts');
      const contactIds = new Map();
      for (const c of plan.contacts) {
        this.db.run('INSERT INTO contacts (nombre, rol, telefono, mail, notas) VALUES (?,?,?,?,?)',
          [c.nombre, c.rol, c.telefono, c.mail, c.notas]);
        contactIds.set(c.key, this.ultimoId());
      }
      const ownerIds = new Map();
      for (const o of plan.owners) {
        this.db.run('INSERT INTO owners (nombre, telefono, mail, notas, contact_id) VALUES (?,?,?,?,?)',
          [o.nombre, o.telefono, o.mail, o.notas, o.contactKey ? contactIds.get(o.contactKey) : null]);
        ownerIds.set(o.key, this.ultimoId());
      }
      for (const l of plan.links) {
        this.db.run('INSERT OR IGNORE INTO contract_owners (contract_id, owner_id, orden) VALUES (?,?,?)',
          [l.contractId, ownerIds.get(l.ownerKey), l.orden]);
      }
      const newIdByName = new Map(plan.owners.map(o => [claveNombre(o.nombre), ownerIds.get(o.key)]));
      const oldToNew = new Map();
      for (const [k, old] of prevOwners) {
        const nid = newIdByName.get(k);
        if (!nid) continue;
        oldToNew.set(old.id, nid);
        this.db.run(`UPDATE owners SET cedula=?, domicilio=?, estado_civil=?, cuenta_cobro=? WHERE id=?`,
          [old.cedula || '', old.domicilio || '', old.estado_civil || '', old.cuenta_cobro || '', nid]);
      }
      for (const d of prevDocs) if (oldToNew.has(d.owner_id)) {
        this.db.run('INSERT INTO owner_docs (owner_id, tipo, archivo, nombre_original, created_at) VALUES (?,?,?,?,?)',
          [oldToNew.get(d.owner_id), d.tipo, d.archivo, d.nombre_original, d.created_at]);
      }
      for (const a of prevAccounts) if (oldToNew.has(a.owner_id)) {
        this.db.run('INSERT OR IGNORE INTO owner_accounts (owner_id, direccion, cuenta) VALUES (?,?,?)',
          [oldToNew.get(a.owner_id), a.direccion, a.cuenta]);
      }
      return { owners: plan.owners.length, contacts: plan.contacts.length, links: plan.links.length };
    });
  }
}

module.exports = { MetodosPropietarios };
