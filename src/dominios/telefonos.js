// Telefonos: numero en formato internacional para abrir WhatsApp (wa.me).

// Prefijos internacionales que ya vienen escritos (Uruguay, Argentina, Brasil, Portugal, España).
const CON_PREFIJO = /^(598|54|55|351|34)/;

// Texto de un telefono ("099 123 456", "+598 99 123 456", "2900 1234") -> "59899123456".
// Los numeros uruguayos sin prefijo se completan con 598 (sin el 0 inicial). null si es muy corto.
export function numeroWhatsApp(texto) {
  const digitos = String(texto || '').replace(/\D/g, '');
  if (digitos.length < 7) return null;
  if (CON_PREFIJO.test(digitos)) return digitos;
  return '598' + (digitos.startsWith('0') ? digitos.slice(1) : digitos);
}
