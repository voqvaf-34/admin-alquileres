// Convierte los campos de texto libre propietario/telefono/mail de los contratos en
// propietarios y contactos unificados. Es una funcion pura: devuelve un plan que la
// base aplica despues.
import { key as nameKey } from './texto.js';
export { nameKey };
const digitsOf = s => String(s || '').replace(/\D/g, '').replace(/^598/, '').replace(/^0/, '');
const PLACEHOLDER = /^[-xX\s.]*$/;
const SPLIT = /\s*\/{1,}\s*/;
const CAMBIO = /\/{2,}\s*CAMBIO\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-+>\s*/i;

function splitParts(s) {
  return String(s || '').split(SPLIT).map(x => x.trim()).filter(x => x && !PLACEHOLDER.test(x));
}
function cleanMail(s) {
  return splitParts(s).flatMap(x => x.split(/[\s;,]+/)).map(x => x.toLowerCase()).filter(x => x.includes('@'));
}

export function unifyOwners(contracts, rules = {}) {
  const contactsCfg = (rules.contacts || []).map(c => ({ ...c, re: c.suffixPattern ? new RegExp(c.suffixPattern, 'i') : null }));
  const aliasMap = new Map();
  for (const [canon, variants] of Object.entries(rules.aliases || {})) {
    aliasMap.set(nameKey(canon), canon);
    for (const v of variants) aliasMap.set(nameKey(v), canon);
  }
  const fixes = new Map((rules.phoneFixes || []).map(f => [nameKey(f.owner), new Set(f.removeDigits.map(digitsOf))]));
  const overrides = new Map(Object.entries(rules.overrides || {}).map(([k, v]) => [nameKey(k), v]));
  const contactPhone = new Map();   // digitos -> contacto
  const contactMail  = new Map();
  for (const c of contactsCfg) {
    (c.phones || []).forEach(p => contactPhone.set(digitsOf(p), c));
    (c.mails || []).forEach(m => contactMail.set(m.toLowerCase(), c));
  }

  const owners = new Map();          // nameKey canonico -> owner acumulado
  const links  = [];
  const review = [];

  const getOwner = (displayName) => {
    const canon = aliasMap.get(nameKey(displayName));
    const name  = canon || displayName.replace(/\s+/g, ' ').trim();
    const key   = nameKey(name);
    if (!owners.has(key)) owners.set(key, { key, nombre: name, fixedName: !!canon, variants: new Set(), phones: [], mails: [], notes: new Set(), contacts: new Map() });
    const o = owners.get(key);
    o.variants.add(displayName.trim());
    // Sin alias: se queda con la grafia mas completa.
    if (!o.fixedName && displayName.trim().length > o.nombre.length) o.nombre = displayName.replace(/\s+/g, ' ').trim();
    return o;
  };

  const sorted = [...contracts].sort((a, b) => String(a.fechaInicio || '').localeCompare(String(b.fechaInicio || '')));
  for (const c of sorted) {
    let prop = String(c.propietario || '').trim(), tel = String(c.telProp || ''), mail = String(c.mailProp || '');
    // Sin nombre pero con telefono o mail del dueno: "Propietario de <apto>".
    let sinNombre = false;
    if (!prop || PLACEHOLDER.test(prop)) {
      const hasTel = splitParts(tel).some(p => digitsOf(p).length >= 7);
      if (!hasTel && !cleanMail(mail).length) continue;
      prop = `Propietario de ${c.direccion}`;
      sinNombre = true;
    }

    // Definicion explicita para casos que no se pueden deducir del texto.
    const ov = overrides.get(nameKey(prop));
    if (ov) {
      const cc = ov.contact ? contactsCfg.find(x => x.key === ov.contact) : null;
      (ov.owners || []).forEach((spec, i) => {
        const o = getOwner(spec.nombre);
        if (spec.telefono) o.phones.push({ raw: spec.telefono, digits: digitsOf(spec.telefono), active: !c.inactive });
        if (spec.mail) o.mails.push(spec.mail.toLowerCase());
        if (cc) o.contacts.set(cc.key, (o.contacts.get(cc.key) || 0) + 1);
        links.push({ contractId: c.id, ownerKey: o.key, orden: i });
      });
      continue;
    }
    let historyNote = null;

    // "A ///// CAMBIO dd/mm/aaaa --> B": el dueno actual es B.
    const ch = prop.match(CAMBIO);
    if (ch) {
      const before = prop.slice(0, ch.index).trim();
      prop = prop.slice(ch.index + ch[0].length).trim();
      const tm = tel.match(CAMBIO);  if (tm) tel  = tel.slice(tm.index + tm[0].length);
      const mm = mail.match(CAMBIO); if (mm) mail = mail.slice(mm.index + mm[0].length);
      historyNote = `Antes: ${before} (cambio de titular ${ch[1]}).`;
    }

    // Contacto indicado en el nombre ("- Juan", "// MARIA PEREZ").
    let contact = null;
    for (const cc of contactsCfg) {
      if (cc.re && cc.re.test(prop) && prop.replace(cc.re, '').trim()) { contact = cc; prop = prop.replace(cc.re, '').trim(); break; }
    }

    // Telefonos y mails: los del contacto no son del propietario.
    let phoneParts = splitParts(tel).filter(p => digitsOf(p).length >= 7);
    let mails = cleanMail(mail);
    for (const p of phoneParts) { const cc = contactPhone.get(digitsOf(p)); if (cc && (!contact || contact === cc)) contact = contact || cc; }
    for (const m of mails)      { const cc = contactMail.get(m);          if (cc && (!contact || contact === cc)) contact = contact || cc; }

    // Copropietarios: "A / B" son dos propietarios, salvo que el texto completo sea un alias.
    const names = (sinNombre || aliasMap.has(nameKey(prop))) ? [prop] : splitParts(prop);
    if (!names.length) continue;
    // Si el contacto es el propio dueno (ej. un contacto que tambien es dueno de aptos), no es contacto.
    if (contact && names.some(n => nameKey(n) === nameKey(contact.nombre))) contact = null;
    if (contact) {
      const cd = new Set((contact.phones || []).map(digitsOf)), cm = new Set((contact.mails || []).map(m => m.toLowerCase()));
      phoneParts = phoneParts.filter(p => !cd.has(digitsOf(p)));
      mails = mails.filter(m => !cm.has(m));
    }
    const matchByIndex = names.length > 1 && phoneParts.length === names.length;
    const mailByIndex  = names.length > 1 && mails.length === names.length;
    if (names.length > 1 && !matchByIndex && phoneParts.length) {
      review.push(`${c.direccion}: ${names.length} propietarios y ${phoneParts.length} telefono(s) en "${c.telProp}"; se asignaron al primero.`);
    }

    // Con varios propietarios, cada mail va a quien aparezca en el (ej. juanperez@... -> Juan Perez).
    const mailOwner = mails.map(m => {
      const local = nameKey(m.split('@')[0]).replace(/ /g, '');
      const idx = names.findIndex(n => nameKey(n).split(' ').filter(t => t.length > 3).some(t => local.includes(t)));
      return idx >= 0 ? idx : 0;
    });

    names.forEach((n, i) => {
      const o = getOwner(n);
      const ph = matchByIndex ? [phoneParts[i]] : (i === 0 ? phoneParts : []);
      const ml = mailByIndex ? [mails[i]] : mails.filter((_, k) => mailOwner[k] === i);
      const fix = fixes.get(o.key);
      for (const p of ph) if (!(fix && fix.has(digitsOf(p)))) o.phones.push({ raw: p, digits: digitsOf(p), active: !c.inactive });
      for (const m of ml) o.mails.push(m);
      if (historyNote) o.notes.add(historyNote);
      if (contact) o.contacts.set(contact.key, (o.contacts.get(contact.key) || 0) + 1);
      links.push({ contractId: c.id, ownerKey: o.key, orden: i });
    });
  }

  const ownerList = [...owners.values()].map(o => {
    // Telefono principal: el mas reciente (preferentemente de un contrato activo).
    const uniq = [];
    for (const p of [...o.phones].reverse()) if (!uniq.some(u => u.digits === p.digits)) uniq.push(p);
    uniq.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));
    const mailsU = [...new Set([...o.mails].reverse())];
    const notes = [...o.notes];
    if (rules.ownerNotes && rules.ownerNotes[o.nombre]) notes.unshift(rules.ownerNotes[o.nombre]);
    if (uniq.length > 1) notes.push(`Otros telefonos: ${uniq.slice(1).map(u => u.raw).join(' / ')}`);
    if (mailsU.length > 1) notes.push(`Otros mails: ${mailsU.slice(1).join(' / ')}`);
    const variants = [...o.variants].filter(v => nameKey(v) !== nameKey(o.nombre));
    if (variants.length) notes.push(`Tambien escrito como: ${variants.join(' | ')}`);
    const contactKey = [...o.contacts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      key: o.key, nombre: o.nombre,
      telefono: uniq[0] ? uniq[0].raw : '', mail: mailsU[0] || '',
      notas: notes.join('\n'), contactKey: contactKey ? contactKey[0] : null,
    };
  });

  const usedContacts = new Set(ownerList.map(o => o.contactKey).filter(Boolean));
  const contactsOut = contactsCfg.filter(c => usedContacts.has(c.key))
    .map(({ key, nombre, rol, telefono, mail, notas }) => ({ key, nombre, rol: rol || '', telefono: telefono || '', mail: mail || '', notas: notas || '' }));

  return { owners: ownerList.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), contacts: contactsOut, links, review };
}

