// Conexion con el proceso principal (window.api del preload).

// Cada llamada devuelve {ok, data} o {ok:false, error}; aca se traduce a throw.
export async function call(method, ...args) {
  const res = await window.api[method](...args);
  if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Error desconocido');
  return res.data;
}
