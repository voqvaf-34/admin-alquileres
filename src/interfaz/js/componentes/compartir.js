// Compartir con el Visor (editor), modo Visor (solo lectura) e indicador de guardado.
import { applyState, render, showApp } from '../app.js';
import { call } from '../nucleo/api.js';
import { esc, showToast } from '../nucleo/dom.js';
import { fmtHora } from '../nucleo/formato.js';
import { populateDBYears } from '../vistas/base-datos.js';

let shareInfo = null;

export function paintShare(st) {
  if (!st) return;
  shareInfo = st;
  const dot = document.getElementById('share-dot');
  dot.className = 'share-dot ' + (!st.dir ? 'off' : st.error ? 'err' : st.pending ? 'pending' : 'ok');
  document.getElementById('btn-share').title = !st.dir ? 'No se comparte con el Visor'
    : st.error ? st.error : st.lastPublished ? `Compartido ${fmtHora(st.lastPublished)} en ${st.dir}` : 'Publicando...';
  document.getElementById('share-dir').textContent = st.dir || 'No se comparte (desactivado).';
  document.getElementById('share-state').innerHTML = !st.dir ? ''
    : st.error ? `<span style="color:var(--amber)">${esc(st.error)}</span>`
    : st.lastPublished ? `<span style="color:var(--green)">&#10003; Última copia publicada: ${fmtHora(st.lastPublished)}</span>` : 'Publicando...';
}

export function paintViewer(v) {
  if (!v) return;
  const el = document.getElementById('viewer-updated');
  el.textContent = v.publicado ? `Datos al ${fmtHora(v.publicado)}` : '';
  el.title = v.dir ? `Carpeta: ${v.dir}` : '';
}

function showViewerSetup(v) {
  document.getElementById('autoload-screen').style.display = 'none';
  document.getElementById('upload-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('viewer-setup-screen').hidden = false;
  document.body.classList.remove('in-app');
  document.getElementById('viewer-setup-error').textContent = v && v.error ? `${v.dir ? v.dir + ': ' : ''}${v.error}` : '';
}

export async function viewerUseState(st) {
  if (st.needsShared) { showViewerSetup(st.viewer); return; }
  document.getElementById('viewer-setup-screen').hidden = true;
  applyState(st);
  showApp();
}

export function paintSave(st) {
  const el = document.getElementById('save-ind');
  if (!el || !st) return;
  const ok = st.ok !== false;
  el.classList.toggle('err', !ok);
  el.innerHTML = ok ? '&#10003;' : '&#10007;';
  el.title = ok
    ? 'Guardado automático funcionando' + (st.at ? ` (último guardado ${fmtHora(st.at)})` : '')
    : 'ERROR: no se pudo guardar en la base local.\n' + (st.error || '') + '\nNo cierres la app y avisá; los cambios siguen en memoria.';
}

// Conecta los eventos de esta parte de la pantalla.
export function iniciar() {
  window.api.onShareChanged(paintShare);

  document.getElementById('btn-share').addEventListener('click', async () => {
    paintShare(await call('shareStatus').catch(() => shareInfo));
    document.getElementById('modal-share').classList.add('open');
  });

  document.getElementById('btn-share-publish').addEventListener('click', async () => {
    try { paintShare(await call('sharePublish')); } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
  });

  document.getElementById('btn-share-pick').addEventListener('click', async () => {
    try { paintShare(await call('sharePick')); } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
  });

  document.getElementById('btn-share-disable').addEventListener('click', async () => {
    if (!confirm('Dejar de compartir con el Visor?\nLa copia que ya está en la carpeta compartida no se borra, pero deja de actualizarse.')) return;
    try { paintShare(await call('shareDisable')); } catch (err) { showToast('Error: ' + esc(err.message), 'err'); }
  });

  document.getElementById('btn-viewer-pick').addEventListener('click', async () => {
    try { const st = await call('viewerPickDir'); if (st) viewerUseState(st); }
    catch (err) { document.getElementById('viewer-setup-error').textContent = err.message; }
  });

  document.getElementById('btn-viewer-retry').addEventListener('click', async () => {
    try { viewerUseState(await call('viewerReload')); } catch (err) { document.getElementById('viewer-setup-error').textContent = err.message; }
  });

  // La app principal publico cambios: recargar manteniendo la pestaña y los filtros.
  window.api.onDataChanged(async () => {
    try {
      const st = await call('getState');
      if (st.needsShared) return;
      applyState(st);
      populateDBYears();
      render();
      showToast('&#8635; Datos actualizados', 'info');
    } catch (_) {}
  });

  window.api.onSaveChanged(st => {
    const wasOk = !document.getElementById('save-ind').classList.contains('err');
    paintSave(st);
    if (st && st.ok === false && wasOk) showToast('Error al guardar: ' + esc(st.error || ''), 'err');
  });

  document.getElementById('btn-menu-share').addEventListener('click', () => document.getElementById('btn-share').click());
}
