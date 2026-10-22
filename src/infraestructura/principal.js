// Arranque de la app (editor o Visor): un solo proceso, bandeja, ventana y canales.
const { app, dialog } = require('electron');
// Permite aislar los datos en tests / instalaciones paralelas (antes de cualquier uso de userData).
if (process.env.ADMIN_ALQ_DATA_DIR) app.setPath('userData', process.env.ADMIN_ALQ_DATA_DIR);
const { ctx } = require('./contexto');
const { IS_VIEWER, START_HIDDEN_ARG } = require('./config');
const estadoApp = require('./estado-app');
const manejadores = require('./manejadores');
const ventana = require('./ventana');
const visor = require('./visor');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', ventana.showWindow);
  app.on('before-quit', () => { ctx.isQuitting = true; });

  app.whenReady().then(async () => {
    if (IS_VIEWER) {
      await visor.loadViewer();                                    // si falla, la pantalla pide elegir carpeta
      visor.startViewerPolling();
      manejadores.registerViewerHandlers();
      ventana.createTray();
      ventana.createWindow({ hidden: process.argv.includes(START_HIDDEN_ARG) });
      return;
    }
    try {
      await estadoApp.openStore();
      ctx.store.backup('startup');
      if (ctx.store.isEmpty() && process.env.ADMIN_ALQ_IMPORT_FILE) estadoApp.importFrom(process.env.ADMIN_ALQ_IMPORT_FILE);
    } catch (e) {
      dialog.showErrorBox(app.getName(), 'No se pudo abrir la base de datos:\n' + e.message);
      app.quit();
      return;
    }
    manejadores.registerHandlers();
    ventana.createTray();
    ventana.createWindow({ hidden: process.argv.includes(START_HIDDEN_ARG) });
  });

  app.on('will-quit', () => { if (ctx.store) ctx.store.close(); });
}
