// Exportacion de las tablas (para los CSV).
class MetodosExportacion {
  // ── exportacion ──────────────────────────────────────────────────────────
  exportarTablas() {
    const propietariosPorContrato = new Map(), contratosPorPropietario = new Map();
    const propietarios = new Map(this.listarPropietarios().map(o => [o.id, o]));
    const contratos = this.listarContratos();
    const cById = new Map(contratos.map(c => [c.id, c]));
    for (const l of this.listarPropietariosDeContratos()) {
      if (!propietariosPorContrato.has(l.idContrato)) propietariosPorContrato.set(l.idContrato, []);
      propietariosPorContrato.get(l.idContrato).push(propietarios.get(l.idPropietario).nombre);
      if (!contratosPorPropietario.has(l.idPropietario)) contratosPorPropietario.set(l.idPropietario, new Set());
      contratosPorPropietario.get(l.idPropietario).add(cById.get(l.idContrato).direccion);
    }
    const contactos = new Map(this.listarContactos().map(c => [c.id, c]));
    const cuentas = new Map();
    for (const a of this.listarCuentasPropietarios()) {
      if (!cuentas.has(a.idPropietario)) cuentas.set(a.idPropietario, []);
      cuentas.get(a.idPropietario).push(`${a.direccion}: ${a.cuenta}`);
    }
    return {
      alquileres: contratos.map(c => ({
        id: c.id, direccion: c.direccion, propietarios: (propietariosPorContrato.get(c.id) || []).join(' / '),
        moneda: c.moneda, importe_base: c.importeBase, importe_actual: c.importe, ultimo_aumento: c.ultimoAumento || '',
        garantia: c.garantia, aumentos_los_hace: c.remitente, contrato: c.contratoTexto, fecha_inicio: c.fechaInicio || '',
        inquilino: c.inquilino, tel_inquilino: c.telInq, mail_inquilino: c.mailInq,
        comentarios: c.notas, estado: c.inactivo ? 'INACTIVO' : 'ACTIVO',
      })),
      propietarios: [...propietarios.values()].map(o => ({
        id: o.id, nombre: o.nombre, cedula: o.cedula, domicilio: o.domicilio, estado_civil: o.estadoCivil,
        celular: o.telefono, mail: o.mail,
        contacto: o.idContacto ? `${contactos.get(o.idContacto).nombre} (${contactos.get(o.idContacto).rol})` : '',
        cuenta_cobro: o.cuentaCobro, cuentas_por_apto: (cuentas.get(o.id) || []).join(' | '), notas: o.notas,
        aptos: [...(contratosPorPropietario.get(o.id) || [])].join(' | '),
      })),
      contactos: [...contactos.values()],
      administraciones: this.listarAdmins(),
    };
  }
}

module.exports = { MetodosExportacion };
