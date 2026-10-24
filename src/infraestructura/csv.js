// Exportacion a CSV (compatible con Excel en español).
const { app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { ctx } = require('./contexto');

// Compatible con Excel en espanol: separador ";" y BOM UTF-8.
function aCsv(filas) {
  if (!filas.length) return '﻿';
  const cols = Object.keys(filas[0]);
  const celda = v => {
    const t = v == null ? '' : String(v);
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [cols.join(';'), ...filas.map(r => cols.map(c => celda(r[c])).join(';'))].join('\r\n');
}

async function exportarCsv() {
  const res = await dialog.showOpenDialog(ctx.ventana, {
    title: 'Elegir carpeta para exportar', properties: ['openDirectory', 'createDirectory'],
    defaultPath: app.getPath('documents'),
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const marcaTiempo = new Date().toISOString().slice(0, 10);
  const dir = path.join(res.filePaths[0], `Admin Alquileres - export ${marcaTiempo}`);
  fs.mkdirSync(dir, { recursive: true });
  const tablas = ctx.base.exportarTablas();
  for (const [nombre, filas] of Object.entries(tablas)) fs.writeFileSync(path.join(dir, `${nombre}.csv`), aCsv(filas), 'utf8');
  shell.openPath(dir);
  return { carpeta: dir, files: Object.keys(tablas).length };
}

Object.assign(module.exports, { exportarCsv });
