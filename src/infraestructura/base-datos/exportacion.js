// Exportacion de las tablas (para los CSV).
class MetodosExportacion {
  // ── exportacion ──────────────────────────────────────────────────────────
  exportarTablas() {
    const propietariosPorContrato = new Map(), contratosPorPropietario = new Map();
    const propietarios = new Map(this.listarPropietarios().map(o => [o.id, o]));
    const contratos = this.listarContratos();
    const cById = new Map(contratos.map(c => [c.id, c]));
    for (const l of this.listarPropietariosDeContratos()) {
      if (!propietariosPorContrato.has(l.contractId)) propietariosPorContrato.set(l.contractId, []);
      propietariosPorContrato.get(l.contractId).push(propietarios.get(l.ownerId).nombre);
      if (!contratosPorPropietario.has(l.ownerId)) contratosPorPropietario.set(l.ownerId, new Set());
      contratosPorPropietario.get(l.ownerId).add(cById.get(l.contractId).direccion);
    }
    const contactos = new Map(this.listarContactos().map(c => [c.id, c]));
    const cuentas = new Map();
    for (const a of this.listarCuentasPropietarios()) {
      if (!cuentas.has(a.ownerId)) cuentas.set(a.ownerId, []);
      cuentas.get(a.ownerId).push(`${a.direccion}: ${a.cuenta}`);
    }
    return {
      alquileres: contratos.map(c => ({
        id: c.id, direccion: c.direccion, propietarios: (propietariosPorContrato.get(c.id) || []).join(' / '),
        moneda: c.moneda, importe_base: c.importeBase, importe_actual: c.importe, ultimo_aumento: c.ultimoAumento || '',
        garantia: c.garantia, aumentos_los_hace: c.remitente, contrato: c.contratoStr, fecha_inicio: c.fechaInicio || '',
        inquilino: c.inquilino, tel_inquilino: c.telInq, mail_inquilino: c.mailInq,
        comentarios: c.notas, estado: c.inactive ? 'INACTIVO' : 'ACTIVO',
      })),
      propietarios: [...propietarios.values()].map(o => ({
        id: o.id, nombre: o.nombre, cedula: o.cedula, domicilio: o.domicilio, estado_civil: o.estadoCivil,
        celular: o.telefono, mail: o.mail,
        contacto: o.contactId ? `${contactos.get(o.contactId).nombre} (${contactos.get(o.contactId).rol})` : '',
        cuenta_cobro: o.cuentaCobro, cuentas_por_apto: (cuentas.get(o.id) || []).join(' | '), notas: o.notas,
        aptos: [...(contratosPorPropietario.get(o.id) || [])].join(' | '),
      })),
      contactos: [...contactos.values()],
      administraciones: this.listarAdmins(),
    };
  }
}

module.exports = { MetodosExportacion };
