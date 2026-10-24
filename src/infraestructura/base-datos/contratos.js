// Alquileres (contratos): alta, edicion, inactivos, direcciones normalizadas y migraciones.
const { s, n } = require('./util');
const COLUMNAS_CONTRATO = {
  direccion: 'direccion', propietario: 'propietario', telProp: 'tel_prop', mailProp: 'mail_prop',
  importeBase: 'importe_base', importe: 'importe', ultimoAumento: 'ultimo_aumento',
  remitente: 'remitente', garantia: 'garantia', moneda: 'moneda', contratoTexto: 'contrato_texto', fechaInicio: 'fecha_inicio',
  inquilino: 'inquilino', telInq: 'tel_inq', mailInq: 'mail_inq', notas: 'notas',
  inactivo: 'inactivo', filaOrigen: 'fila_origen',
};
// Campos que la UI puede modificar sueltos (aumento enviado, comentario).
const CAMPOS_MODIFICABLES = new Set(['importe', 'ultimoAumento', 'notas']);

function registroAContrato(r) {
  return {
    id: r.id, direccion: r.direccion, propietario: r.propietario, telProp: r.tel_prop,
    mailProp: r.mail_prop, importeBase: r.importe_base, importe: r.importe,
    ultimoAumento: r.ultimo_aumento, remitente: r.remitente, contratoTexto: r.contrato_texto,
    fechaInicio: r.fecha_inicio, inquilino: r.inquilino, telInq: r.tel_inq,
    mailInq: r.mail_inq, notas: r.notas, inactivo: !!r.inactivo,
    edificio: r.edificio || '', calle: r.calle || '', unidad: r.unidad || '',
    direccionOriginal: r.direccion_original || '', garantia: r.garantia || '',
    moneda: r.moneda === 'USD' ? 'USD' : 'UYU',
  };
}

class MetodosContratos {
  // ── contratos ────────────────────────────────────────────────────────────
  estaVacia() { return this.consultar('SELECT COUNT(*) AS c FROM contratos')[0].c === 0; }

  listarContratos() {
    return this.consultar('SELECT * FROM contratos ORDER BY id').map(registroAContrato);
  }

  obtenerContrato(id) {
    const r = this.consultar('SELECT * FROM contratos WHERE id = ?', [id])[0];
    return r ? registroAContrato(r) : null;
  }

  _insertarContrato(c) {
    const imp = n(c.importeBase);
    if (!s(c.direccion)) throw new Error('La direccion es obligatoria.');
    if (!imp || imp <= 0) throw new Error('El importe es obligatorio.');
    this.db.run(
      `INSERT INTO contratos (direccion, propietario, tel_prop, mail_prop, importe_base, importe,
        ultimo_aumento, remitente, contrato_texto, fecha_inicio, inquilino, tel_inq, mail_inq, notas,
        inactivo, fila_origen, edificio, calle, unidad, direccion_original, garantia, moneda)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s(c.direccion), s(c.propietario), s(c.telProp), s(c.mailProp), imp, n(c.importe) || imp,
       c.ultimoAumento || null, s(c.remitente), s(c.contratoTexto), c.fechaInicio || null,
       s(c.inquilino), s(c.telInq), s(c.mailInq), s(c.notas), c.inactivo ? 1 : 0,
       c.filaOrigen == null ? null : c.filaOrigen, s(c.edificio), s(c.calle), s(c.unidad), s(c.direccionOriginal), s(c.garantia), c.moneda === 'USD' ? 'USD' : 'UYU']);
    return this.ultimoId();
  }

  // Las marcas y las cuentas de cobro se guardan por direccion: si un apto cambia de
  // nombre (y ningun otro contrato usa el nombre viejo) se renombran tambien.
  _renombrarReferenciasDireccion(direccionVieja, nuevaDireccion) {
    if (!direccionVieja || direccionVieja === nuevaDireccion) return;
    if (this.consultar('SELECT 1 FROM contratos WHERE direccion=?', [direccionVieja]).length) return;
    this._recalcularClavesMarcas(new Map([[direccionVieja, nuevaDireccion]]));
    this.db.run(`UPDATE OR IGNORE cuentas_propietarios SET direccion=? WHERE direccion=?`, [nuevaDireccion, direccionVieja]);
    this.db.run(`DELETE FROM cuentas_propietarios WHERE direccion=?`, [direccionVieja]);
  }

  // Cambia la direccion dentro de las claves de marks ("a|DIR|m|y", "v|DIR"...). Si dos
  // direcciones viejas caen en la misma nueva, se queda la marca mas reciente.
  _recalcularClavesMarcas(mapa) {
    const aFecha = d => { const p = String(d || '').split('/'); return p.length === 3 ? `${p[2]}${p[1]}${p[0]}` : ''; };
    const salida = {};
    for (const r of this.consultar('SELECT clave, datos FROM marcas')) {
      const partes = r.clave.split('|');
      if (mapa.has(partes[1])) partes[1] = mapa.get(partes[1]);
      const k = partes.join('|');
      const datos = JSON.parse(r.datos);
      if (!salida[k] || aFecha(datos.fecha) > aFecha(salida[k].fecha)) salida[k] = datos;
    }
    this.db.run('DELETE FROM marcas');
    for (const [k, v] of Object.entries(salida)) this.db.run('INSERT INTO marcas (clave, datos) VALUES (?, ?)', [k, JSON.stringify(v)]);
  }

  // Borra contratos inactivos sin ningun dato de contacto del propietario (ni telefono,
  // ni mail, ni contacto), y los propietarios que quedan sin aptos por eso.
  purgarInactivosSinContacto() {
    const propietarios = new Map(this.listarPropietarios().map(o => [o.id, o]));
    const enlaces = this.listarPropietariosDeContratos();
    const porContrato = new Map();
    for (const l of enlaces) { if (!porContrato.has(l.idContrato)) porContrato.set(l.idContrato, []); porContrato.get(l.idContrato).push(propietarios.get(l.idPropietario)); }
    const aBorrar = this.listarContratos().filter(c => c.inactivo &&
      !(porContrato.get(c.id) || []).some(o => o && (o.telefono || o.mail || o.idContacto)));
    if (!aBorrar.length) return [];
    const afectados = new Set(aBorrar.flatMap(c => (porContrato.get(c.id) || []).map(o => o && o.id)).filter(Boolean));
    this.transaccion(() => {
      for (const c of aBorrar) {
        this.db.run('DELETE FROM contratos_propietarios WHERE contrato_id=?', [c.id]);
        this.db.run('DELETE FROM contratos WHERE id=?', [c.id]);
      }
      for (const oid of afectados) {
        if (!this.consultar('SELECT 1 FROM contratos_propietarios WHERE propietario_id=?', [oid]).length) this.db.run('DELETE FROM propietarios WHERE id=?', [oid]);
      }
    });
    return aBorrar.map(c => `${c.direccion}${c.propietario ? ` (${c.propietario})` : ''}`);
  }

  ponerNombresInquilinos(lista) {
    this.transaccion(() => { for (const t of lista) this.db.run('UPDATE contratos SET inquilino=? WHERE id=?', [s(t.inquilino), t.id]); });
  }

  // Aplica direcciones normalizadas: [{id, edificio, calle, unidad, direccion}].
  aplicarDirecciones(lista) {
    return this.transaccion(() => {
      const porId = new Map(this.listarContratos().map(c => [c.id, c]));
      const mapa = new Map();
      for (const a of lista) {
        const viejo = porId.get(a.id);
        if (!viejo) continue;
        this.db.run(`UPDATE contratos SET edificio=?, calle=?, unidad=?, direccion=?,
          direccion_original=CASE WHEN direccion_original='' THEN direccion ELSE direccion_original END WHERE id=?`,
          [s(a.edificio), s(a.calle), s(a.unidad), s(a.direccion), a.id]);
        if (viejo.direccion !== a.direccion) mapa.set(viejo.direccion, a.direccion);
      }
      this._recalcularClavesMarcas(mapa);
      return mapa.size;
    });
  }

  agregarContrato(c) {
    const id = this.transaccion(() => this._insertarContrato({ ...c, importe: c.importeBase, inactivo: false }));
    return this.obtenerContrato(id);
  }

  // Edicion completa desde el modal. Igual que la app original: el importe
  // ingresado pasa a ser tanto el base como el actual.
  editarContrato(id, c) {
    const anterior = this.obtenerContrato(id);
    if (!anterior) throw new Error('Alquiler inexistente.');
    const imp = n(c.importeBase);
    if (!s(c.direccion)) throw new Error('La direccion es obligatoria.');
    if (!imp || imp <= 0) throw new Error('El importe es obligatorio.');
    this.transaccion(() => {
      this.db.run(
        `UPDATE contratos SET direccion=?, propietario=?, tel_prop=?, mail_prop=?, importe_base=?,
          importe=?, contrato_texto=?, fecha_inicio=?, inquilino=?, tel_inq=?, mail_inq=?, notas=?,
          edificio=?, calle=?, unidad=?, garantia=?, remitente=?, moneda=?, actualizado=datetime('now','localtime') WHERE id=?`,
        [s(c.direccion), s(c.propietario), s(c.telProp), s(c.mailProp), imp, imp, s(c.contratoTexto),
         c.fechaInicio || null, s(c.inquilino), s(c.telInq), s(c.mailInq), s(c.notas),
         s(c.edificio), s(c.calle), s(c.unidad),
         c.garantia === undefined ? anterior.garantia : s(c.garantia),
         c.remitente === undefined ? anterior.remitente : s(c.remitente),
         c.moneda === undefined ? anterior.moneda : (c.moneda === 'USD' ? 'USD' : 'UYU'), id]);
      this._renombrarReferenciasDireccion(anterior.direccion, s(c.direccion));
    });
    return this.obtenerContrato(id);
  }

  modificarContrato(id, campos) {
    if (!this.obtenerContrato(id)) throw new Error('Alquiler inexistente.');
    const claves = Object.keys(campos).filter(k => CAMPOS_MODIFICABLES.has(k));
    if (!claves.length) return this.obtenerContrato(id);
    const conjuntos = claves.map(k => `${COLUMNAS_CONTRATO[k]} = ?`).join(', ');
    const valores = claves.map(k => k === 'importe' ? n(campos[k]) : (k === 'notas' ? s(campos[k]) : (campos[k] || null)));
    this.transaccion(() => this.db.run(
      `UPDATE contratos SET ${conjuntos}, actualizado=datetime('now','localtime') WHERE id = ?`, [...valores, id]));
    return this.obtenerContrato(id);
  }

  // CGN / ANDA estaban cargados como "remitente": pasan a ser la garantia. Los demas
  // remitentes (quien hace los aumentos) quedan con el nombre formateado.
  migrarGarantias(formatearNombre) {
    let n = 0;
    this.transaccion(() => {
      for (const c of this.listarContratos()) {
        const r = s(c.remitente), up = r.toUpperCase();
        if (['CGN', 'ANDA'].includes(up)) {
          this.db.run("UPDATE contratos SET garantia=?, remitente='' WHERE id=?", [c.garantia || up, c.id]); n++;
        } else if (r && formatearNombre && formatearNombre(r) !== r) {
          this.db.run('UPDATE contratos SET remitente=? WHERE id=?', [formatearNombre(r), c.id]); n++;
        }
      }
    });
    return n;
  }

  // Alquileres en dolares: los importes de hasta 4 cifras (en pesos arrancan en 5 cifras).
  migrarMoneda() {
    this.transaccion(() => this.db.run("UPDATE contratos SET moneda='USD' WHERE importe > 0 AND importe < 10000 AND moneda='UYU'"));
  }

  marcarInactivo(id) {
    if (!this.obtenerContrato(id)) throw new Error('Alquiler inexistente.');
    this.transaccion(() => this.db.run(
      `UPDATE contratos SET inactivo=1, actualizado=datetime('now','localtime') WHERE id=?`, [id]));
    return this.obtenerContrato(id);
  }
}

module.exports = { MetodosContratos };
