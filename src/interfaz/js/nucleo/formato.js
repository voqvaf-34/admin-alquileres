// Formatos para mostrar: importes, telefonos con WhatsApp, mails, listas, dias que faltan.
import * as D from '../../../dominios/index.js';
import { Separadores } from '../../../dominios/index.js';
import { esc } from './dom.js';

export const NOMBRES_MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Importes en pesos ($) o dolares (US$) segun la moneda del alquiler.
export function formatearDinero(n, moneda) { return (moneda === 'USD' ? 'US$ ' : '$') + Math.round(n).toLocaleString('es-UY'); }

export function mesesAtras(date) {
  const now = new Date();
  const diff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  if (diff >= 24) return `hace ${Math.floor(diff/12)} años`;
  if (diff >= 12) return `hace 1 año`;
  return `hace ${diff} mes${diff !== 1 ? 'es' : ''}`;
}

export function formatearIPC(v) { return v.toFixed(2).replace('.', ',') + '%'; }

// Enlace que abre WhatsApp con ese numero; html es lo que se muestra (ya escapado).
const enlaceWhatsApp = (numero, html) => `<a class="wa" href="https://wa.me/${numero}" target="_blank" rel="noopener">${html}</a>`;

// Varios valores en un mismo dato (co-propietarios, telefonos, mails, edificios) se muestran
// separados por un punto tenue, igual en todas las pantallas.
const SEP  = ' <span class="msep">&middot;</span> ';

const NADA = '<span style="color:var(--dim)">-</span>';

const esNada = t => !t || /^[-xX\s]*$/.test(t);

export function enlaceTelefono(raw) {
  if (esNada(raw)) return NADA;
  const out = Separadores.telefonos(raw).filter(p => !esNada(p)).map(part => {
    const numero = D.numeroWhatsApp(part);
    return numero ? enlaceWhatsApp(numero, esc(part)) : `<span class="tel">${esc(part)}</span>`;
  });
  return out.length ? out.join(SEP) : NADA;
}

export function formatearNombres(raw) {
  const out = Separadores.personas(raw || '').map(esc);
  return out.length ? out.join(SEP) : NADA;
}

export function formatearMails(raw) {
  const out = Separadores.mails(raw || '').map(m => m.includes('@')
    ? `<a class="mail-val" href="mailto:${esc(m)}">${esc(m)}</a>` : `<span class="mail-val">${esc(m)}</span>`);
  return out.length ? out.join(SEP) : NADA;
}

// Texto libre de telefonos (admin.) -- cada telefono separado; los numeros pasan a WhatsApp
// preservando las etiquetas ("Emergencias: ...").
export function enlazarTelefonosEnTexto(raw) {
  if (esNada(raw)) return NADA;
  return Separadores.telefonos(raw).map(p => esc(p).replace(/\d[\d\s]{6,}\d/g, m => {
    const numero = D.numeroWhatsApp(m);
    return numero ? enlaceWhatsApp(numero, m) : m;
  })).join(SEP);
}

export function enlazarMailsEnTexto(raw) { return formatearMails(raw); }

// Comentarios en las tarjetas: uno por renglon (sin las notas de renovacion).
export function formatearNotas(e) {
  const list = D.comentarios(e);
  return list.length ? `<div class="card-nota">${list.map(n => `<div class="nota-item">${esc(n)}</div>`).join('')}</div>` : '';
}

export function formatearEdificios(raw) {
  const out = Separadores.edificios(raw || '').map(esc);
  return out.length ? out.join(SEP) : NADA;
}

// Rojo si el vencimiento es urgente, amarillo si no (la regla esta en dominios/vencimientos.js).
export function colorPorDias(vd) {
  return D.urgenciaVencimiento(vd) === 'urgente' ? 'var(--red)' : 'var(--amber)';
}

export function diasFaltan(vd) {
  const d = D.diasHasta(vd);
  return d > 1 ? ` &middot; faltan ${d} días` : d === 1 ? ' &middot; mañana' : d === 0 ? ' &middot; hoy' : '';
}

export function insigniaGarantia(e) {
  if (!e.garantia) return '';
  const g = D.GARANTIAS_GESTIONAN.includes(e.garantia.toUpperCase());
  return `<span class="garantia-badge${g ? ' gestiona' : ''}" title="Garantía ${esc(e.garantia)}${g ? ' (gestiona aumentos y renovaciones)' : ''}">${esc(e.garantia)}</span>`;
}

// Usa helpers de app.js (call, esc, mostrarAviso, aplicarEstado, dibujar, mostrarApp...).
export const formatearHora = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
