// Formatos para mostrar: importes, telefonos con WhatsApp, mails, listas, dias que faltan.
import * as D from '../../../dominios/index.js';
import { Splitters } from '../../../dominios/index.js';
import { esc } from './dom.js';

export const MONTH_NAMES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Importes en pesos ($) o dolares (US$) segun la moneda del alquiler.
export function fmtMoney(n, moneda) { return (moneda === "USD" ? "US$ " : "$") + Math.round(n).toLocaleString("es-UY"); }

export function monthsAgo(date) {
  const now = new Date();
  const diff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  if (diff >= 24) return `hace ${Math.floor(diff/12)} años`;
  if (diff >= 12) return `hace 1 año`;
  return `hace ${diff} mes${diff !== 1 ? 'es' : ''}`;
}

export function fmtIPC(v) { return v.toFixed(2).replace('.', ',') + '%'; }

export function toWaPhone(digits) {
  if (digits.length < 7) return null;
  if (/^(598|54|55|351|34)/.test(digits)) return digits;
  if (digits.startsWith('0')) return '598' + digits.slice(1);
  return '598' + digits;
}

// Varios valores en un mismo dato (co-propietarios, telefonos, mails, edificios) se muestran
// separados por un punto tenue, igual en todas las pantallas.
export const SEP  = ' <span class="msep">&middot;</span> ';

export const NADA = '<span style="opacity:0.35">-</span>';

export const isNada = t => !t || /^[-xX\s]*$/.test(t);

export function telLink(raw) {
  if (isNada(raw)) return NADA;
  const out = Splitters.telefonos(raw).filter(p => !isNada(p)).map(part => {
    const phone = toWaPhone(part.replace(/\D/g, ''));
    if (!phone) return `<span class="tel">${esc(part)}</span>`;
    return `<a class="wa" href="https://wa.me/${phone}" target="_blank" rel="noopener">${esc(part)}</a>`;
  });
  return out.length ? out.join(SEP) : NADA;
}

export function fmtNames(raw) {
  const out = Splitters.personas(raw || '').map(esc);
  return out.length ? out.join(SEP) : NADA;
}

export function fmtMails(raw) {
  const out = Splitters.mails(raw || '').map(m => m.includes('@')
    ? `<a class="mail-val" href="mailto:${esc(m)}">${esc(m)}</a>` : `<span class="mail-val">${esc(m)}</span>`);
  return out.length ? out.join(SEP) : NADA;
}

// Texto libre de telefonos (admin.) -- cada telefono separado; los numeros pasan a WhatsApp
// preservando las etiquetas ("Emergencias: ...").
export function linkPhonesInText(raw) {
  if (isNada(raw)) return NADA;
  return Splitters.telefonos(raw).map(p => esc(p).replace(/\d[\d\s]{6,}\d/g, m => {
    const phone = toWaPhone(m.replace(/\D/g, ''));
    return phone ? `<a class="wa" href="https://wa.me/${phone}" target="_blank" rel="noopener">${m}</a>` : m;
  })).join(SEP);
}

export function linkMailsInText(raw) { return fmtMails(raw); }

// Comentarios en las tarjetas: uno por renglon (sin las notas de renovacion).
export function fmtNotas(e) {
  const list = D.comentarios(e);
  return list.length ? `<div class="card-nota">${list.map(n => `<div class="nota-item">${esc(n)}</div>`).join('')}</div>` : '';
}

export function fmtEdificios(raw) {
  const out = Splitters.edificios(raw || '').map(esc);
  return out.length ? out.join(SEP) : NADA;
}

export function colorPorDias(vd) {
  if (!vd) return "var(--amber)";
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return (vd - t) / 86400000 <= 10 ? "var(--red)" : "var(--amber)";
}

export function diasFaltan(vd) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = Math.round((vd - t) / 86400000);
  return d > 1 ? ` &middot; faltan ${d} días` : d === 1 ? ' &middot; mañana' : d === 0 ? ' &middot; hoy' : '';
}

export function garantiaBadge(e) {
  if (!e.garantia) return '';
  const g = D.GARANTIAS_GESTIONAN.includes(e.garantia.toUpperCase());
  return `<span class="garantia-badge${g ? ' gestiona' : ''}" title="Garantía ${esc(e.garantia)}${g ? ' (gestiona aumentos y renovaciones)' : ''}">${esc(e.garantia)}</span>`;
}

// Usa helpers de app.js (call, esc, showToast, applyState, render, showApp...).
export const fmtHora = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
