// Convierte los campos de texto libre propietario/telefono/mail de los contratos en
// propietarios y contactos unificados. Es una funcion pura: devuelve un plan que la
// base aplica despues.
import { claveNombre } from './texto.js';
const digitosDe = s => String(s || '').replace(/\D/g, '').replace(/^598/, '').replace(/^0/, '');
const MARCADOR_VACIO = /^[-xX\s.]*$/;
const SEPARADOR = /\s*\/{1,}\s*/;
const CAMBIO = /\/{2,}\s*CAMBIO\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-+>\s*/i;

function separarPartes(s) {
  return String(s || '').split(SEPARADOR).map(x => x.trim()).filter(x => x && !MARCADOR_VACIO.test(x));
}
function limpiarMail(s) {
  return separarPartes(s).flatMap(x => x.split(/[\s;,]+/)).map(x => x.toLowerCase()).filter(x => x.includes('@'));
}

export function planUnificarPropietarios(contratos, reglas = {}) {
  const contactosConfig = (reglas.contactos || []).map(c => ({ ...c, re: c.patronSufijo ? new RegExp(c.patronSufijo, 'i') : null }));
  const mapaAlias = new Map();
  for (const [canon, variantes] of Object.entries(reglas.alias || {})) {
    mapaAlias.set(claveNombre(canon), canon);
    for (const v of variantes) mapaAlias.set(claveNombre(v), canon);
  }
  const correcciones = new Map((reglas.correccionesTelefono || []).map(f => [claveNombre(f.owner), new Set(f.quitarDigitos.map(digitosDe))]));
  const reemplazos = new Map(Object.entries(reglas.correccionesManuales || {}).map(([k, v]) => [claveNombre(k), v]));
  const telefonoContacto = new Map();   // digitos -> contacto
  const mailContacto  = new Map();
  for (const c of contactosConfig) {
    (c.telefonos || []).forEach(p => telefonoContacto.set(digitosDe(p), c));
    (c.mails || []).forEach(m => mailContacto.set(m.toLowerCase(), c));
  }

  const propietarios = new Map();          // claveNombre canonico -> owner acumulado
  const enlaces  = [];
  const revision = [];

  const obtenerPropietario = (nombreVisible) => {
    const canon = mapaAlias.get(claveNombre(nombreVisible));
    const nombre  = canon || nombreVisible.replace(/\s+/g, ' ').trim();
    const clave   = claveNombre(nombre);
    if (!propietarios.has(clave)) propietarios.set(clave, { clave, nombre, nombreFijo: !!canon, variantes: new Set(), telefonos: [], mails: [], notas: new Set(), contactos: new Map() });
    const o = propietarios.get(clave);
    o.variantes.add(nombreVisible.trim());
    // Sin alias: se queda con la grafia mas completa.
    if (!o.nombreFijo && nombreVisible.trim().length > o.nombre.length) o.nombre = nombreVisible.replace(/\s+/g, ' ').trim();
    return o;
  };

  const ordenados = [...contratos].sort((a, b) => String(a.fechaInicio || '').localeCompare(String(b.fechaInicio || '')));
  for (const c of ordenados) {
    let prop = String(c.propietario || '').trim(), tel = String(c.telProp || ''), mail = String(c.mailProp || '');
    // Sin nombre pero con telefono o mail del dueno: "Propietario de <apto>".
    let sinNombre = false;
    if (!prop || MARCADOR_VACIO.test(prop)) {
      const tieneTel = separarPartes(tel).some(p => digitosDe(p).length >= 7);
      if (!tieneTel && !limpiarMail(mail).length) continue;
      prop = `Propietario de ${c.direccion}`;
      sinNombre = true;
    }

    // Definicion explicita para casos que no se pueden deducir del texto.
    const ov = reemplazos.get(claveNombre(prop));
    if (ov) {
      const cc = ov.contacto ? contactosConfig.find(x => x.clave === ov.contacto) : null;
      (ov.propietarios || []).forEach((especificacion, i) => {
        const o = obtenerPropietario(especificacion.nombre);
        if (especificacion.telefono) o.telefonos.push({ original: especificacion.telefono, digitos: digitosDe(especificacion.telefono), activo: !c.inactivo });
        if (especificacion.mail) o.mails.push(especificacion.mail.toLowerCase());
        if (cc) o.contactos.set(cc.clave, (o.contactos.get(cc.clave) || 0) + 1);
        enlaces.push({ idContrato: c.id, clavePropietario: o.clave, orden: i });
      });
      continue;
    }
    let notaHistorial = null;

    // "A ///// CAMBIO dd/mm/aaaa --> B": el dueno actual es B.
    const ch = prop.match(CAMBIO);
    if (ch) {
      const antesDe = prop.slice(0, ch.index).trim();
      prop = prop.slice(ch.index + ch[0].length).trim();
      const tm = tel.match(CAMBIO);  if (tm) tel  = tel.slice(tm.index + tm[0].length);
      const mm = mail.match(CAMBIO); if (mm) mail = mail.slice(mm.index + mm[0].length);
      notaHistorial = `Antes: ${antesDe} (cambio de titular ${ch[1]}).`;
    }

    // Contacto indicado en el nombre ("- Juan", "// MARIA PEREZ").
    let contacto = null;
    for (const cc of contactosConfig) {
      if (cc.re && cc.re.test(prop) && prop.replace(cc.re, '').trim()) { contacto = cc; prop = prop.replace(cc.re, '').trim(); break; }
    }

    // Telefonos y mails: los del contacto no son del propietario.
    let partesTelefono = separarPartes(tel).filter(p => digitosDe(p).length >= 7);
    let mails = limpiarMail(mail);
    for (const p of partesTelefono) { const cc = telefonoContacto.get(digitosDe(p)); if (cc && (!contacto || contacto === cc)) contacto = contacto || cc; }
    for (const m of mails)      { const cc = mailContacto.get(m);          if (cc && (!contacto || contacto === cc)) contacto = contacto || cc; }

    // Copropietarios: "A / B" son dos propietarios, salvo que el texto completo sea un alias.
    const nombres = (sinNombre || mapaAlias.has(claveNombre(prop))) ? [prop] : separarPartes(prop);
    if (!nombres.length) continue;
    // Si el contacto es el propio dueno (ej. un contacto que tambien es dueno de aptos), no es contacto.
    if (contacto && nombres.some(n => claveNombre(n) === claveNombre(contacto.nombre))) contacto = null;
    if (contacto) {
      const cd = new Set((contacto.telefonos || []).map(digitosDe)), cm = new Set((contacto.mails || []).map(m => m.toLowerCase()));
      partesTelefono = partesTelefono.filter(p => !cd.has(digitosDe(p)));
      mails = mails.filter(m => !cm.has(m));
    }
    const coincidenciaPorIndice = nombres.length > 1 && partesTelefono.length === nombres.length;
    const mailPorIndice  = nombres.length > 1 && mails.length === nombres.length;
    if (nombres.length > 1 && !coincidenciaPorIndice && partesTelefono.length) {
      revision.push(`${c.direccion}: ${nombres.length} propietarios y ${partesTelefono.length} telefono(s) en "${c.telProp}"; se asignaron al primero.`);
    }

    // Con varios propietarios, cada mail va a quien aparezca en el (ej. juanperez@... -> Juan Perez).
    const mailPropietario = mails.map(m => {
      const local = claveNombre(m.split('@')[0]).replace(/ /g, '');
      const idx = nombres.findIndex(n => claveNombre(n).split(' ').filter(t => t.length > 3).some(t => local.includes(t)));
      return idx >= 0 ? idx : 0;
    });

    nombres.forEach((n, i) => {
      const o = obtenerPropietario(n);
      const ph = coincidenciaPorIndice ? [partesTelefono[i]] : (i === 0 ? partesTelefono : []);
      const ml = mailPorIndice ? [mails[i]] : mails.filter((_, k) => mailPropietario[k] === i);
      const correccion = correcciones.get(o.clave);
      for (const p of ph) if (!(correccion && correccion.has(digitosDe(p)))) o.telefonos.push({ original: p, digitos: digitosDe(p), activo: !c.inactivo });
      for (const m of ml) o.mails.push(m);
      if (notaHistorial) o.notas.add(notaHistorial);
      if (contacto) o.contactos.set(contacto.clave, (o.contactos.get(contacto.clave) || 0) + 1);
      enlaces.push({ idContrato: c.id, clavePropietario: o.clave, orden: i });
    });
  }

  const listaPropietarios = [...propietarios.values()].map(o => {
    // Telefono principal: el mas reciente (preferentemente de un contrato activo).
    const unicos = [];
    for (const p of [...o.telefonos].reverse()) if (!unicos.some(u => u.digitos === p.digitos)) unicos.push(p);
    unicos.sort((a, b) => (b.activo ? 1 : 0) - (a.activo ? 1 : 0));
    const mailsU = [...new Set([...o.mails].reverse())];
    const notas = [...o.notas];
    if (reglas.notasPropietarios && reglas.notasPropietarios[o.nombre]) notas.unshift(reglas.notasPropietarios[o.nombre]);
    if (unicos.length > 1) notas.push(`Otros telefonos: ${unicos.slice(1).map(u => u.original).join(' / ')}`);
    if (mailsU.length > 1) notas.push(`Otros mails: ${mailsU.slice(1).join(' / ')}`);
    const variantes = [...o.variantes].filter(v => claveNombre(v) !== claveNombre(o.nombre));
    if (variantes.length) notas.push(`Tambien escrito como: ${variantes.join(' | ')}`);
    const claveContacto = [...o.contactos.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      clave: o.clave, nombre: o.nombre,
      telefono: unicos[0] ? unicos[0].original : '', mail: mailsU[0] || '',
      notas: notas.join('\n'), claveContacto: claveContacto ? claveContacto[0] : null,
    };
  });

  const contactosUsados = new Set(listaPropietarios.map(o => o.claveContacto).filter(Boolean));
  const contactosSalida = contactosConfig.filter(c => contactosUsados.has(c.clave))
    .map(({ clave, nombre, rol, telefono, mail, notas }) => ({ clave, nombre, rol: rol || '', telefono: telefono || '', mail: mail || '', notas: notas || '' }));

  return { propietarios: listaPropietarios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), contactos: contactosSalida, vinculos: enlaces, revision };
}

