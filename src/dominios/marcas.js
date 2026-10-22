// Claves de las marcas (aumento enviado, renovado, no renueva...), guardadas por direccion.

export const aumKey  = (e,m,y) => `a|${e.direccion}|${m}|${y}`;

export const vncKey  = e => `v|${e.direccion}`;

export const vncKeyR = e => `vr|${e.direccion}`;

export const naKey   = (e,m,y) => `na|${e.direccion}|${m}|${y}`;

export const nrKey   = e => `nr|${e.direccion}`;
