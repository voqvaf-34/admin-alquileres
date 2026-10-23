// Exportacion a CSV (compatible con Excel en español).
const { app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { ctx } = require('./contexto');

// Compatible con Excel en espanol: separador ";" y BOM UTF-8.
function toCsv(rows) {
  if (!rows.length) return '﻿';
  const cols = Object.keys(rows[0]);
  const cell = v => {
    const t = v == null ? '' : String(v);
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))].join('\r\n');
}

async function exportCsv() {
  const res = await dialog.showOpenDialog(ctx.win, {
    title: 'Elegir carpeta para exportar', properties: ['openDirectory', 'createDirectory'],
    defaultPath: app.getPath('documents'),
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(res.filePaths[0], `Admin Alquileres - export ${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const tables = ctx.store.exportTables();
  for (const [name, rows] of Object.entries(tables)) fs.writeFileSync(path.join(dir, `${name}.csv`), toCsv(rows), 'utf8');
  shell.openPath(dir);
  return { dir, files: Object.keys(tables).length };
}

Object.assign(module.exports, { exportCsv });
