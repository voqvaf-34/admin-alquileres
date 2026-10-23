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
  const dot = document.getElementById('share-dot');
  dot.className = 'share-dot ' + (!st.dir ? 'off' : st.error ? 'err' : st.pending ? 'pending' : 'ok');
  document.getElementById('btn-share').title = !st.dir ? 'No se comparte con el Visor'
    : st.error ? st.error : st.lastPublished ? `Compartido ${formatearHora(st.lastPublished)} en ${st.dir}` : 'Publicando...';
  document.getElementById('share-dir').textContent = st.dir || 'No se comparte (desactivado).';
  document.getElementById('share-state').innerHTML = !st.dir ? ''
    : st.error ? `<span style="color:var(--amber)">${esc(st.error)}</span>`
    : st.lastPublished ? `<span style="color:var(--green)">&#10003; Última copia publicada: ${formatearHora(st.lastPublished)}</span>` : 'Publicando...';
}

export function pintarVisor(v) {
  if (!v) return;
  const el = document.getElementById('viewer-updated');
  el.textContent = v.publicado ? `Datos al ${formatearHora(v.publicado)}` : '';
  el.title = v.dir ? `Carpeta: ${v.dir}` : '';
}

function mostrarConfigVisor(v) {
  document.getElementById('autoload-screen').style.display = 'none';
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('viewer-setup-screen').hidden = false;
  document.body.classList.remove('in-app');
  document.getElementById('viewer-setup-error').textContent = v && v.error ? `${v.dir ? v.dir + ': ' : ''}${v.error}` : '';
}

export async function visorUsarEstado(st) {
  if (st.needsShared) { mostrarConfigVisor(st.viewer); return; }
  document.getElementById('viewer-setup-screen').hidden = true;
  aplicarEstado(st);
  mostrarApp();
}

export function pintarGuardado(st) {
  const el = document.getElementById('save-ind');
  if (!el || !st) return;
  const ok = st.ok !== false;
  el.classList.toggle('err', !ok);
  el.innerHTML = ok ? '&#10003;' : '&#10007;';
  el.title = ok
    ? 'Guardado automático funcionando' + (st.at ? ` (último guardado ${formatearHora(st.at)})` : '')
    : 'ERROR: no se pudo guardar en la base local.\n' + (st.error || '') + '\nNo cierres la app y avisá; los cambios siguen en memoria.';
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  window.api.alCambiarCompartir(pintarCompartir);

  document.getElementById('btn-share').addEventListener('click', async () => {
    pintarCompartir(await call('estadoCompartir').catch(() => infoCompartir));
    document.getElementById('modal-share').classList.add('open');
  });

  document.getElementById('btn-share-publish').addEventListener('click', async () => {
    try { pintarCompartir(await call('publicarCompartido')); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
  });

  document.getElementById('btn-share-pick').addEventListener('click', async () => {
    try { pintarCompartir(await call('elegirCarpetaCompartida')); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
  });

  document.getElementById('btn-share-disable').addEventListener('click', async () => {
    if (!confirm('Dejar de compartir con el Visor?\nLa copia que ya está en la carpeta compartida no se borra, pero deja de actualizarse.')) return;
    try { pintarCompartir(await call('desactivarCompartir')); } catch (err) { mostrarAviso('Error: ' + esc(err.message), 'err'); }
  });

  document.getElementById('btn-viewer-pick').addEventListener('click', async () => {
    try { const st = await call('visorElegirCarpeta'); if (st) visorUsarEstado(st); }
    catch (err) { document.getElementById('viewer-setup-error').textContent = err.message; }
  });

  document.getElementById('btn-viewer-retry').addEventListener('click', async () => {
    try { visorUsarEstado(await call('visorRecargar')); } catch (err) { document.getElementById('viewer-setup-error').textContent = err.message; }
  });

  // La app principal publico cambios: recargar manteniendo la pestaña y los filtros.
  window.api.alCambiarDatos(async () => {
    try {
      const st = await call('obtenerEstado');
      if (st.needsShared) return;
      aplicarEstado(st);
      llenarAniosBase();
      dibujar();
      mostrarAviso('&#8635; Datos actualizados', 'info');
    } catch (_) {}
  });

  window.api.alCambiarGuardado(st => {
    const wasOk = !document.getElementById('save-ind').classList.contains('err');
    pintarGuardado(st);
    if (st && st.ok === false && wasOk) mostrarAviso('Error al guardar: ' + esc(st.error || ''), 'err');
  });

  document.getElementById('btn-menu-share').addEventListener('click', () => document.getElementById('btn-share').click());
}
