// IPC del mes: carga manual y consulta automatica al INE.
import * as D from '../../../dominios/index.js';
import { dibujar } from '../app.js';
import { call } from '../nucleo/api.js';
import { estado } from '../nucleo/estado.js';

function ponerIPC(value) {
  estado.ipc = value;
  document.getElementById('inp-ipc').value = estado.ipc;
  call('guardarAjuste', 'ipc', estado.ipc).catch(() => {});
}

export async function consultarIPC() {
  const btn = document.getElementById('btn-ipc-fetch'), period = document.getElementById('ipc-period');
  btn.textContent = '...'; btn.disabled = true; period.textContent = '';
  try {
    const r = await call('consultarIPC');
    if (r.ok) {
      ponerIPC(r.ipc);
      const mes = D.MES_ES[r.month];
      period.textContent = `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${r.year}`;
      period.title = '';
      dibujar();
    } else {
      console.warn('IPC:', r.error);
      period.textContent = 'sin conexion';
      period.title = r.error;
    }
  } catch (err) {
    period.textContent = 'error';
    period.title = err.message;
  } finally {
    btn.textContent = '↻'; btn.disabled = false;
  }
}
