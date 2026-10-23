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

  agregarDocPropietario(idPropietario, tipo, archivo, nombreOriginal) {
    this.transaccion(() => this.db.run('INSERT INTO owner_docs (owner_id, tipo, archivo, nombre_original) VALUES (?,?,?,?)',
      [idPropietario, s(tipo) || 'cedula', archivo, s(nombreOriginal)]));
  }
  obtenerDocPropietario(id) {
    const [d] = this.consultar('SELECT id, owner_id AS ownerId, archivo, nombre_original AS nombreOriginal FROM owner_docs WHERE id=?', [id]);
    return d || null;
  }
  borrarDocPropietario(id) { this.transaccion(() => this.db.run('DELETE FROM owner_docs WHERE id=?', [id])); }

  // Cuenta / metodo de cobro de un propietario para un apto puntual ('' la borra).
  ponerCuentaPropietario(idPropietario, direccion, cuenta) {
    this.transaccion(() => {
      if (!s(cuenta)) this.db.run('DELETE FROM owner_accounts WHERE owner_id=? AND direccion=?', [idPropietario, direccion]);
      else this.db.run(`INSERT INTO owner_accounts (owner_id, direccion, cuenta) VALUES (?,?,?)
        ON CONFLICT(owner_id, direccion) DO UPDATE SET cuenta=excluded.cuenta`, [idPropietario, direccion, s(cuenta)]);
    });
  }
  listarContactos() { return this.consultar('SELECT id, nombre, rol, telefono, mail, notas FROM contacts ORDER BY nombre COLLATE NOCASE'); }
  listarPropietariosDeContratos() {
    return this.consultar('SELECT contract_id AS contractId, owner_id AS ownerId, orden FROM contract_owners ORDER BY contract_id, orden');
  }

  _existeContacto(id) { return id == null || this.consultar('SELECT 1 FROM contacts WHERE id=?', [id]).length > 0; }

  guardarPropietario(o) {
    if (!s(o.nombre)) throw new Error('El nombre del propietario es obligatorio.');
    const idContacto = o.contactId ? Number(o.contactId) : null;
    if (!this._existeContacto(idContacto)) throw new Error('Contacto inexistente.');
    const valores = [s(o.nombre), s(o.telefono), s(o.mail), s(o.notas), idContacto,
                  s(o.cedula), s(o.domicilio), s(o.estadoCivil), s(o.cuentaCobro)];
    return this.transaccion(() => {
      if (o.id != null) {
        this.db.run(`UPDATE owners SET nombre=?, telefono=?, mail=?, notas=?, contact_id=?, cedula=?, domicilio=?,
          estado_civil=?, cuenta_cobro=? WHERE id=?`, [...valores, o.id]);
        return o.id;
      }
      this.db.run(`INSERT INTO owners (nombre, telefono, mail, notas, contact_id, cedula, domicilio, estado_civil, cuenta_cobro)
        VALUES (?,?,?,?,?,?,?,?,?)`, valores);
      return this.ultimoId();
    });
  }

  borrarPropietario(id) { this.transaccion(() => this.db.run('DELETE FROM owners WHERE id=?', [id])); }

  guardarContacto(c) {
    if (!s(c.nombre)) throw new Error('El nombre del contacto es obligatorio.');
    const valores = [s(c.nombre), s(c.rol), s(c.telefono), s(c.mail), s(c.notas)];
    return this.transaccion(() => {
      if (c.id != null) { this.db.run('UPDATE contacts SET nombre=?, rol=?, telefono=?, mail=?, notas=? WHERE id=?', [...valores, c.id]); return c.id; }
      this.db.run('INSERT INTO contacts (nombre, rol, telefono, mail, notas) VALUES (?,?,?,?,?)', valores);
      return this.ultimoId();
    });
  }

  borrarContacto(id) { this.transaccion(() => this.db.run('DELETE FROM contacts WHERE id=?', [id])); }

  // Une "drop" dentro de "keep": pasa los aptos, completa datos vacios y suma notas.
  unificarPropietarios(idConservar, idQuitar) {
    if (idConservar === idQuitar) throw new Error('No se puede unificar un propietario consigo mismo.');
    const [conservar] = this.consultar('SELECT * FROM owners WHERE id=?', [idConservar]);
    const [quitar] = this.consultar('SELECT * FROM owners WHERE id=?', [idQuitar]);
    if (!conservar || !quitar) throw new Error('Propietario inexistente.');
    const notas = [conservar.notas, quitar.notas, `Unificado con: ${quitar.nombre}`].filter(x => x && x.trim()).join('\n');
    this.transaccion(() => {
      this.db.run(`INSERT OR IGNORE INTO contract_owners (contract_id, owner_id, orden)
                   SELECT contract_id, ?, orden FROM contract_owners WHERE owner_id=?`, [idConservar, idQuitar]);
      this.db.run(`INSERT OR IGNORE INTO owner_accounts (owner_id, direccion, cuenta)
                   SELECT ?, direccion, cuenta FROM owner_accounts WHERE owner_id=?`, [idConservar, idQuitar]);
      this.db.run('UPDATE owner_docs SET owner_id=? WHERE owner_id=?', [idConservar, idQuitar]);
      this.db.run(`UPDATE owners SET telefono=?, mail=?, notas=?, contact_id=?, cedula=?, domicilio=?,
        estado_civil=?, cuenta_cobro=? WHERE id=?`,
        [conservar.telefono || quitar.telefono, conservar.mail || quitar.mail, notas, conservar.contact_id ?? quitar.contact_id,
         conservar.cedula || quitar.cedula, conservar.domicilio || quitar.domicilio, conservar.estado_civil || quitar.estado_civil,
         conservar.cuenta_cobro || quitar.cuenta_cobro, idConservar]);
      this.db.run('DELETE FROM owners WHERE id=?', [idQuitar]);
    });
  }

  asignarPropietariosContrato(idContrato, idsPropietarios) {
    this.transaccion(() => this._asignarPropietariosContrato(idContrato, idsPropietarios));
  }
  _asignarPropietariosContrato(idContrato, idsPropietarios) {
    this.db.run('DELETE FROM contract_owners WHERE contract_id=?', [idContrato]);
    [...new Set(idsPropietarios)].forEach((oid, i) =>
      this.db.run('INSERT INTO contract_owners (contract_id, owner_id, orden) VALUES (?,?,?)', [idContrato, oid, i]));
  }

  // Vincula un contrato a partir del texto del modal ("A / B"): reutiliza propietarios
  // existentes por nombre y crea los que falten (con tel/mail si es uno solo).
  vincularPropietariosDesdeTexto(idContrato, texto, telefono, mail, claveNombre) {
    this.transaccion(() => this._vincularPropietariosDesdeTexto(idContrato, texto, telefono, mail, claveNombre));
  }
  _vincularPropietariosDesdeTexto(idContrato, texto, telefono, mail, claveNombre) {
    const nombres = String(texto || '').split(/\s*\/{1,}\s*/).map(x => x.trim()).filter(Boolean);
    const existentes = this.listarPropietarios();
    const ids = nombres.map(n => {
      const encontrado = existentes.find(o => claveNombre(o.nombre) === claveNombre(n));
      if (encontrado) {
        if (nombres.length === 1 && (!encontrado.telefono || !encontrado.mail)) {
          this.db.run('UPDATE owners SET telefono=?, mail=? WHERE id=?',
            [encontrado.telefono || s(telefono), encontrado.mail || s(mail), encontrado.id]);
        }
        return encontrado.id;
      }
      this.db.run('INSERT INTO owners (nombre, telefono, mail) VALUES (?,?,?)',
        [n, nombres.length === 1 ? s(telefono) : '', nombres.length === 1 ? s(mail) : '']);
      return this.ultimoId();
    });
    this._asignarPropietariosContrato(idContrato, ids);
  }

  // Aplica el plan del unificador (reemplaza propietarios, contactos y vinculos).
  aplicarPlanPropietarios(plan) {
    // Los datos cargados a mano (cedula, documentos, cuentas...) se conservan por nombre.
    const propietariosAnteriores = new Map(this.consultar('SELECT * FROM owners').map(o => [claveNombre(o.nombre), o]));
    const docsAnteriores = this.consultar('SELECT * FROM owner_docs');
    const cuentasAnteriores = this.consultar('SELECT * FROM owner_accounts');
    return this.transaccion(() => {
      this.db.run('DELETE FROM contract_owners');
      this.db.run('DELETE FROM owners');
      this.db.run('DELETE FROM contacts');
      const idsContactos = new Map();
      for (const c of plan.contacts) {
        this.db.run('INSERT INTO contacts (nombre, rol, telefono, mail, notas) VALUES (?,?,?,?,?)',
          [c.nombre, c.rol, c.telefono, c.mail, c.notas]);
        idsContactos.set(c.key, this.ultimoId());
      }
      const idsPropietarios = new Map();
      for (const o of plan.owners) {
        this.db.run('INSERT INTO owners (nombre, telefono, mail, notas, contact_id) VALUES (?,?,?,?,?)',
          [o.nombre, o.telefono, o.mail, o.notas, o.contactKey ? idsContactos.get(o.contactKey) : null]);
        idsPropietarios.set(o.key, this.ultimoId());
      }
      for (const l of plan.links) {
        this.db.run('INSERT OR IGNORE INTO contract_owners (contract_id, owner_id, orden) VALUES (?,?,?)',
          [l.contractId, idsPropietarios.get(l.ownerKey), l.orden]);
      }
      const nuevoIdPorNombre = new Map(plan.owners.map(o => [claveNombre(o.nombre), idsPropietarios.get(o.key)]));
      const viejoANuevo = new Map();
      for (const [k, viejo] of propietariosAnteriores) {
        const nid = nuevoIdPorNombre.get(k);
        if (!nid) continue;
        viejoANuevo.set(viejo.id, nid);
        this.db.run(`UPDATE owners SET cedula=?, domicilio=?, estado_civil=?, cuenta_cobro=? WHERE id=?`,
          [viejo.cedula || '', viejo.domicilio || '', viejo.estado_civil || '', viejo.cuenta_cobro || '', nid]);
      }
      for (const d of docsAnteriores) if (viejoANuevo.has(d.owner_id)) {
        this.db.run('INSERT INTO owner_docs (owner_id, tipo, archivo, nombre_original, created_at) VALUES (?,?,?,?,?)',
          [viejoANuevo.get(d.owner_id), d.tipo, d.archivo, d.nombre_original, d.created_at]);
      }
      for (const a of cuentasAnteriores) if (viejoANuevo.has(a.owner_id)) {
        this.db.run('INSERT OR IGNORE INTO owner_accounts (owner_id, direccion, cuenta) VALUES (?,?,?)',
          [viejoANuevo.get(a.owner_id), a.direccion, a.cuenta]);
      }
      return { owners: plan.owners.length, contacts: plan.contacts.length, links: plan.links.length };
    });
  }
}

module.exports = { MetodosPropietarios };
