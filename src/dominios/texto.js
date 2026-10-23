// Utilidades de texto para buscar y comparar sin importar tildes ni mayusculas.

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Para busquedas: "Olímpicos" -> "olimpicos".
export function normalizar(s) {
  return sinTildes(s).toLowerCase();
}

// Clave para comparar nombres/direcciones: sin tildes, mayusculas, solo letras y numeros.
export const claveNombre = s => sinTildes(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
