// Arranque de la app (editor o Visor): un solo proceso, bandeja, ventana y canales.
const { app, dialog } = require('electron');
// Permite aislar los datos en tests / instalaciones paralelas (antes de cualquier uso de userData).
if (process.env.ADMIN_ALQ_DATA_DIR) app.setPath('userData', process.env.ADMIN_ALQ_DATA_DIR);
const { ctx } = require('./contexto');
const { ES_VISOR, ARG_INICIO_OCULTO } = require('./config');
const estadoApp = require('./estado-app');
const manejadores = require('./manejadores');
const ventana = require('./ventana');
const visor = require('./visor');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', ventana.mostrarVentana);
  app.on('before-quit', () => { ctx.isQuitting = true; });

  app.whenReady().then(async () => {
    if (ES_VISOR) {
      await visor.cargarVisor();                                    // si falla, la pantalla pide elegir carpeta
      visor.iniciarSondeoVisor();
      manejadores.registrarManejadoresVisor();
      ventana.crearBandeja();
      ventana.crearVentana({ hidden: process.argv.includes(ARG_INICIO_OCULTO) });
      return;
    }
    try {
      await estadoApp.abrirBase();
      ctx.store.respaldar('startup');
      if (ctx.store.estaVacia() && process.env.ADMIN_ALQ_IMPORT_FILE) estadoApp.importarDesde(process.env.ADMIN_ALQ_IMPORT_FILE);
    } catch (e) {
      dialog.showErrorBox(app.getName(), 'No se pudo abrir la base de datos:\n' + e.message);
      app.quit();
      return;
    }
    manejadores.registrarManejadores();
    ventana.crearBandeja();
    ventana.crearVentana({ hidden: process.argv.includes(ARG_INICIO_OCULTO) });
  });

  app.on('will-quit', () => { if (ctx.store) ctx.store.close(); });
}
