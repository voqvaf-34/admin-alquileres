// Claves de las marcas (aumento enviado, renovado, no renueva...), guardadas por direccion.

export const claveAumento  = (e,m,y) => `a|${e.direccion}|${m}|${y}`;

export const claveVenc  = e => `v|${e.direccion}`;

export const claveVencRenovado = e => `vr|${e.direccion}`;

export const claveNoAumenta   = (e,m,y) => `na|${e.direccion}|${m}|${y}`;

export const claveNoRenueva   = e => `nr|${e.direccion}`;
