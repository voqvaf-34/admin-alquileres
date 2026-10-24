// Compartir con el Visor (editor), modo Visor (solo lectura) e indicador de guardado.
import { aplicarEstado, dibujar, mostrarApp } from '../app.js';
import { call } from '../nucleo/api.js';
import { esc, mostrarAviso } from '../nucleo/dom.js';
import { formatearHora } from '../nucleo/formato.js';
import { llenarAniosBase } from '../vistas/base-datos.js';

let infoCompartir = null;

export function pintarCompartir(st) {
  if (!st) return;
  infoCompartir = st;
  const punto = document.getElementById('compartir-punto');
  punto.className = 'compartir-punto ' + (!st.carpeta ? 'apagado' : st.error ? 'error' : st.pendiente ? 'pendiente' : 'ok');
  document.getElementById('btn-compartir').title = !st.carpeta ? 'No se comparte con el Visor'
    : st.error ? st.error : st.ultimaPublicacion ? `Compartido ${formatearHora(st.ultimaPublicacion)} en ${st.carpeta}` : 'Publicando...';
  document.getElementById('compartir-dir').textContent = st.carpeta || 'No se comparte (desactivado).';
  document.getElementById('compartir-estado').innerHTML = !st.carpeta ? ''
    : st.error ? `<span style="color:var(--ambar)">${esc(st.error)}</span>`
    : st.ultimaPublicacion ? `<span style="color:var(--verde)">&#10003; Última copia publicada: ${formatearHora(st.ultimaPublicacion)}</span>` : 'Publicando...';
}

export function pintarVisor(v) {
  if (!v) return;
  const el = document.getElementById('visor-actualizado');
  el.textContent = v.publicado ? `Datos al ${formatearHora(v.publicado)}` : '';
  el.title = v.carpeta ? `Carpeta: ${v.carpeta}` : '';
}

function mostrarConfigVisor(v) {
  document.getElementById('autocarga-pantalla').style.display = 'none';
  document.getElementById('carga-pantalla').style.display = 'none';
  document.getElementById('app-pantalla').style.display = 'none';
  document.getElementById('visor-config-pantalla').hidden = false;
  document.body.classList.remove('en-app');
  document.getElementById('visor-config-error').textContent = v && v.error ? `${v.carpeta ? v.carpeta + ': ' : ''}${v.error}` : '';
}

export async function visorUsarEstado(st) {
  if (st.necesitaCompartida) { mostrarConfigVisor(st.visor); return; }
  document.getElementById('visor-config-pantalla').hidden = true;
  aplicarEstado(st);
  mostrarApp();
}

export function pintarGuardado(st) {
  const el = document.getElementById('guardado-ind');
  if (!el || !st) return;
  const ok = st.ok !== false;
  el.classList.toggle('error', !ok);
  el.innerHTML = ok ? '&#10003;' : '&#10007;';
  el.title = ok
    ? 'Guardado automático funcionando' + (st.at ? ` (último guardado ${formatearHora(st.at)})` : '')
    : 'ERROR: no se pudo guardar en la base local.\n' + (st.error || '') + '\nNo cierres la app y avisá; los cambios siguen en memoria.';
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  window.api.alCambiarCompartir(pintarCompartir);

  document.getElementById('btn-compartir').addEventListener('click', async () => {
    pintarCompartir(await call('estadoCompartir').catch(() => infoCompartir));
    document.getElementById('modal-compartir').classList.add('abierto');
  });

  document.getElementById('btn-compartir-publicar').addEventListener('click', async () => {
    try { pintarCompartir(await call('publicarCompartido')); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'error'); }
  });

  document.getElementById('btn-compartir-elegir').addEventListener('click', async () => {
    try { pintarCompartir(await call('elegirCarpetaCompartida')); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'error'); }
  });

  document.getElementById('btn-compartir-desactivar').addEventListener('click', async () => {
    if (!confirm('Dejar de compartir con el Visor?\nLa copia que ya está en la carpeta compartida no se borra, pero deja de actualizarse.')) return;
    try { pintarCompartir(await call('desactivarCompartir')); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'error'); }
  });

  document.getElementById('btn-visor-elegir').addEventListener('click', async () => {
    try { const st = await call('visorElegirCarpeta'); if (st) visorUsarEstado(st); }
    catch (err) { document.getElementById('visor-config-error').textContent = err.message; }
  });

  document.getElementById('btn-visor-reintentar').addEventListener('click', async () => {
    try { visorUsarEstado(await call('visorRecargar')); } catch (err) { document.getElementById('visor-config-error').textContent = err.message; }
  });

  // La app principal publico cambios: recargar manteniendo la pestaña y los filtros.
  window.api.alCambiarDatos(async () => {
    try {
      const st = await call('obtenerEstado');
      if (st.necesitaCompartida) return;
      aplicarEstado(st);
      llenarAniosBase();
      dibujar();
      mostrarAviso('&#8635; Datos actualizados', 'info');
    } catch (_) {}
  });

  window.api.alCambiarGuardado(st => {
    const estabaBien = !document.getElementById('guardado-ind').classList.contains('error');
    pintarGuardado(st);
    if (st && st.ok === false && estabaBien) mostrarAviso('Error al guardar: ' + esc(st.error || ''), 'error');
  });

  document.getElementById('btn-menu-compartir').addEventListener('click', () => document.getElementById('btn-compartir').click());
}
