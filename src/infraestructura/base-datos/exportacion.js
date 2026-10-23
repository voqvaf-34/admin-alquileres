// Exportacion de las tablas (para los CSV).
class MetodosExportacion {
  // ── exportacion ──────────────────────────────────────────────────────────
  exportTables() {
    const ownersByContract = new Map(), contractsByOwner = new Map();
    const owners = new Map(this.listOwners().map(o => [o.id, o]));
    const contracts = this.listContracts();
    const cById = new Map(contracts.map(c => [c.id, c]));
    for (const l of this.listContractOwners()) {
      if (!ownersByContract.has(l.contractId)) ownersByContract.set(l.contractId, []);
      ownersByContract.get(l.contractId).push(owners.get(l.ownerId).nombre);
      if (!contractsByOwner.has(l.ownerId)) contractsByOwner.set(l.ownerId, new Set());
      contractsByOwner.get(l.ownerId).add(cById.get(l.contractId).direccion);
    }
    const contacts = new Map(this.listContacts().map(c => [c.id, c]));
    const accounts = new Map();
    for (const a of this.listOwnerAccounts()) {
      if (!accounts.has(a.ownerId)) accounts.set(a.ownerId, []);
      accounts.get(a.ownerId).push(`${a.direccion}: ${a.cuenta}`);
    }
    return {
      alquileres: contracts.map(c => ({
        id: c.id, direccion: c.direccion, propietarios: (ownersByContract.get(c.id) || []).join(' / '),
        moneda: c.moneda, importe_base: c.importeBase, importe_actual: c.importe, ultimo_aumento: c.ultimoAumento || '',
        garantia: c.garantia, aumentos_los_hace: c.remitente, contrato: c.contratoStr, fecha_inicio: c.fechaInicio || '',
        inquilino: c.inquilino, tel_inquilino: c.telInq, mail_inquilino: c.mailInq,
        comentarios: c.notas, estado: c.inactive ? 'INACTIVO' : 'ACTIVO',
      })),
      propietarios: [...owners.values()].map(o => ({
        id: o.id, nombre: o.nombre, cedula: o.cedula, domicilio: o.domicilio, estado_civil: o.estadoCivil,
        celular: o.telefono, mail: o.mail,
        contacto: o.contactId ? `${contacts.get(o.contactId).nombre} (${contacts.get(o.contactId).rol})` : '',
        cuenta_cobro: o.cuentaCobro, cuentas_por_apto: (accounts.get(o.id) || []).join(' | '), notas: o.notas,
        aptos: [...(contractsByOwner.get(o.id) || [])].join(' | '),
      })),
      contactos: [...contacts.values()],
      administraciones: this.listAdmins(),
    };
  }
}

module.exports = { MetodosExportacion };
