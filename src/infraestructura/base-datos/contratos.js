// Alquileres (contratos): alta, edicion, inactivos, direcciones normalizadas y migraciones.
const { s, n } = require('./util');
const CONTRACT_COLS = {
  direccion: 'direccion', propietario: 'propietario', telProp: 'tel_prop', mailProp: 'mail_prop',
  importeBase: 'importe_base', importe: 'importe', ultimoAumento: 'ultimo_aumento',
  remitente: 'remitente', garantia: 'garantia', moneda: 'moneda', contratoStr: 'contrato_str', fechaInicio: 'fecha_inicio',
  inquilino: 'inquilino', telInq: 'tel_inq', mailInq: 'mail_inq', notas: 'notas',
  inactive: 'inactive', sourceRow: 'source_row',
};
// Campos que la UI puede modificar sueltos (aumento enviado, comentario).
const PATCHABLE = new Set(['importe', 'ultimoAumento', 'notas']);

function rowToContract(r) {
  return {
    id: r.id, direccion: r.direccion, propietario: r.propietario, telProp: r.tel_prop,
    mailProp: r.mail_prop, importeBase: r.importe_base, importe: r.importe,
    ultimoAumento: r.ultimo_aumento, remitente: r.remitente, contratoStr: r.contrato_str,
    fechaInicio: r.fecha_inicio, inquilino: r.inquilino, telInq: r.tel_inq,
    mailInq: r.mail_inq, notas: r.notas, inactive: !!r.inactive,
    edificio: r.edificio || '', calle: r.calle || '', unidad: r.unidad || '',
    direccionOriginal: r.direccion_original || '', garantia: r.garantia || '',
    moneda: r.moneda === 'USD' ? 'USD' : 'UYU',
  };
}

class MetodosContratos {
  // ── contratos ────────────────────────────────────────────────────────────
  isEmpty() { return this.all('SELECT COUNT(*) AS c FROM contracts')[0].c === 0; }

  listContracts() {
    return this.all('SELECT * FROM contracts ORDER BY id').map(rowToContract);
  }

  getContract(id) {
    const r = this.all('SELECT * FROM contracts WHERE id = ?', [id])[0];
    return r ? rowToContract(r) : null;
  }

  _insertContract(c) {
    const imp = n(c.importeBase);
    if (!s(c.direccion)) throw new Error('La direccion es obligatoria.');
    if (!imp || imp <= 0) throw new Error('El importe es obligatorio.');
    this.db.run(
      `INSERT INTO contracts (direccion, propietario, tel_prop, mail_prop, importe_base, importe,
        ultimo_aumento, remitente, contrato_str, fecha_inicio, inquilino, tel_inq, mail_inq, notas,
        inactive, source_row, edificio, calle, unidad, direccion_original, garantia, moneda)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [s(c.direccion), s(c.propietario), s(c.telProp), s(c.mailProp), imp, n(c.importe) || imp,
       c.ultimoAumento || null, s(c.remitente), s(c.contratoStr), c.fechaInicio || null,
       s(c.inquilino), s(c.telInq), s(c.mailInq), s(c.notas), c.inactive ? 1 : 0,
       c.sourceRow == null ? null : c.sourceRow, s(c.edificio), s(c.calle), s(c.unidad), s(c.direccionOriginal), s(c.garantia), c.moneda === 'USD' ? 'USD' : 'UYU']);
    return this.lastId();
  }

  // Las marcas y las cuentas de cobro se guardan por direccion: si un apto cambia de
  // nombre (y ningun otro contrato usa el nombre viejo) se renombran tambien.
  _renameDireccionRefs(oldDir, newDir) {
    if (!oldDir || oldDir === newDir) return;
    if (this.all('SELECT 1 FROM contracts WHERE direccion=?', [oldDir]).length) return;
    this._rekeyMarks(new Map([[oldDir, newDir]]));
    this.db.run(`UPDATE OR IGNORE owner_accounts SET direccion=? WHERE direccion=?`, [newDir, oldDir]);
    this.db.run(`DELETE FROM owner_accounts WHERE direccion=?`, [oldDir]);
  }

  // Cambia la direccion dentro de las claves de marks ("a|DIR|m|y", "v|DIR"...). Si dos
  // direcciones viejas caen en la misma nueva, se queda la marca mas reciente.
  _rekeyMarks(map) {
    const toDate = d => { const p = String(d || '').split('/'); return p.length === 3 ? `${p[2]}${p[1]}${p[0]}` : ''; };
    const out = {};
    for (const r of this.all('SELECT key, data FROM marks')) {
      const parts = r.key.split('|');
      if (map.has(parts[1])) parts[1] = map.get(parts[1]);
      const k = parts.join('|');
      const data = JSON.parse(r.data);
      if (!out[k] || toDate(data.date) > toDate(out[k].date)) out[k] = data;
    }
    this.db.run('DELETE FROM marks');
    for (const [k, v] of Object.entries(out)) this.db.run('INSERT INTO marks (key, data) VALUES (?, ?)', [k, JSON.stringify(v)]);
  }

  // Borra contratos inactivos sin ningun dato de contacto del propietario (ni telefono,
  // ni mail, ni contacto), y los propietarios que quedan sin aptos por eso.
  purgeInactiveWithoutContact() {
    const owners = new Map(this.listOwners().map(o => [o.id, o]));
    const links = this.listContractOwners();
    const byContract = new Map();
    for (const l of links) { if (!byContract.has(l.contractId)) byContract.set(l.contractId, []); byContract.get(l.contractId).push(owners.get(l.ownerId)); }
    const toDelete = this.listContracts().filter(c => c.inactive &&
      !(byContract.get(c.id) || []).some(o => o && (o.telefono || o.mail || o.contactId)));
    if (!toDelete.length) return [];
    const affected = new Set(toDelete.flatMap(c => (byContract.get(c.id) || []).map(o => o && o.id)).filter(Boolean));
    this.transaction(() => {
      for (const c of toDelete) {
        this.db.run('DELETE FROM contract_owners WHERE contract_id=?', [c.id]);
        this.db.run('DELETE FROM contracts WHERE id=?', [c.id]);
      }
      for (const oid of affected) {
        if (!this.all('SELECT 1 FROM contract_owners WHERE owner_id=?', [oid]).length) this.db.run('DELETE FROM owners WHERE id=?', [oid]);
      }
    });
    return toDelete.map(c => `${c.direccion}${c.propietario ? ` (${c.propietario})` : ''}`);
  }

  setTenantNames(list) {
    this.transaction(() => { for (const t of list) this.db.run('UPDATE contracts SET inquilino=? WHERE id=?', [s(t.inquilino), t.id]); });
  }

  // Aplica direcciones normalizadas: [{id, edificio, calle, unidad, direccion}].
  applyAddresses(list) {
    return this.transaction(() => {
      const byId = new Map(this.listContracts().map(c => [c.id, c]));
      const map = new Map();
      for (const a of list) {
        const old = byId.get(a.id);
        if (!old) continue;
        this.db.run(`UPDATE contracts SET edificio=?, calle=?, unidad=?, direccion=?,
          direccion_original=CASE WHEN direccion_original='' THEN direccion ELSE direccion_original END WHERE id=?`,
          [s(a.edificio), s(a.calle), s(a.unidad), s(a.direccion), a.id]);
        if (old.direccion !== a.direccion) map.set(old.direccion, a.direccion);
      }
      this._rekeyMarks(map);
      return map.size;
    });
  }

  addContract(c) {
    const id = this.transaction(() => this._insertContract({ ...c, importe: c.importeBase, inactive: false }));
    return this.getContract(id);
  }

  // Edicion completa desde el modal. Igual que la app original: el importe
  // ingresado pasa a ser tanto el base como el actual.
  updateContract(id, c) {
    const prev = this.getContract(id);
    if (!prev) throw new Error('Alquiler inexistente.');
    const imp = n(c.importeBase);
    if (!s(c.direccion)) throw new Error('La direccion es obligatoria.');
    if (!imp || imp <= 0) throw new Error('El importe es obligatorio.');
    this.transaction(() => {
      this.db.run(
        `UPDATE contracts SET direccion=?, propietario=?, tel_prop=?, mail_prop=?, importe_base=?,
          importe=?, contrato_str=?, fecha_inicio=?, inquilino=?, tel_inq=?, mail_inq=?, notas=?,
          edificio=?, calle=?, unidad=?, garantia=?, remitente=?, moneda=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [s(c.direccion), s(c.propietario), s(c.telProp), s(c.mailProp), imp, imp, s(c.contratoStr),
         c.fechaInicio || null, s(c.inquilino), s(c.telInq), s(c.mailInq), s(c.notas),
         s(c.edificio), s(c.calle), s(c.unidad),
         c.garantia === undefined ? prev.garantia : s(c.garantia),
         c.remitente === undefined ? prev.remitente : s(c.remitente),
         c.moneda === undefined ? prev.moneda : (c.moneda === 'USD' ? 'USD' : 'UYU'), id]);
      this._renameDireccionRefs(prev.direccion, s(c.direccion));
    });
    return this.getContract(id);
  }

  patchContract(id, fields) {
    if (!this.getContract(id)) throw new Error('Alquiler inexistente.');
    const keys = Object.keys(fields).filter(k => PATCHABLE.has(k));
    if (!keys.length) return this.getContract(id);
    const sets = keys.map(k => `${CONTRACT_COLS[k]} = ?`).join(', ');
    const vals = keys.map(k => k === 'importe' ? n(fields[k]) : (k === 'notas' ? s(fields[k]) : (fields[k] || null)));
    this.transaction(() => this.db.run(
      `UPDATE contracts SET ${sets}, updated_at=datetime('now','localtime') WHERE id = ?`, [...vals, id]));
    return this.getContract(id);
  }

  // CGN / ANDA estaban cargados como "remitente": pasan a ser la garantia. Los demas
  // remitentes (quien hace los aumentos) quedan con el nombre formateado.
  migrateGarantias(fmtName) {
    let n = 0;
    this.transaction(() => {
      for (const c of this.listContracts()) {
        const r = s(c.remitente), up = r.toUpperCase();
        if (['CGN', 'ANDA'].includes(up)) {
          this.db.run("UPDATE contracts SET garantia=?, remitente='' WHERE id=?", [c.garantia || up, c.id]); n++;
        } else if (r && fmtName && fmtName(r) !== r) {
          this.db.run('UPDATE contracts SET remitente=? WHERE id=?', [fmtName(r), c.id]); n++;
        }
      }
    });
    return n;
  }

  // Alquileres en dolares: los importes de hasta 4 cifras (en pesos arrancan en 5 cifras).
  migrateMoneda() {
    this.transaction(() => this.db.run("UPDATE contracts SET moneda='USD' WHERE importe > 0 AND importe < 10000 AND moneda='UYU'"));
  }

  setInactive(id) {
    if (!this.getContract(id)) throw new Error('Alquiler inexistente.');
    this.transaction(() => this.db.run(
      `UPDATE contracts SET inactive=1, updated_at=datetime('now','localtime') WHERE id=?`, [id]));
    return this.getContract(id);
  }
}

module.exports = { MetodosContratos };
