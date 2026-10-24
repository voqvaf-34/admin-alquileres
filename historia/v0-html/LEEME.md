# Versión 0: la app HTML original

Así empezó Admin Alquileres, en mayo de 2026: una página HTML que se abría en el navegador y leía y
escribía una planilla de Excel con macros, a través de un pequeño servidor local en PowerShell.

Se guarda acá como referencia histórica, tal como era. Solo se reemplazaron los datos de la
inmobiliaria donde se usó: el nombre (ahora "Inmobiliaria del Sur"), la carpeta de red y el nombre de la
planilla. La planilla con los datos reales no forma parte del repositorio.

| Archivo | Qué hacía |
|---|---|
| `ADMIN ALQUILERES.html` | La pantalla: pestañas de Base de Datos, Aumentos, Renovaciones y Administraciones. |
| `admin-app.js` | Toda la lógica en un solo archivo: leer el Excel con SheetJS, calcular aumentos y vencimientos, dibujar las pestañas y mandar los cambios al servidor. |
| `admin-style.css` | Estilos (solo tema oscuro). |
| `launcher.ps1` | Servidor HTTP local (puerto 7890) que leía y escribía el `.xlsm` con COM de Excel. |
| `Abrir Admin Alquileres.bat` / `.vbs` | Accesos directos para arrancar el servidor sin ventana. |

No está pensada para ejecutarse: depende de Excel instalado y de una planilla con un formato puntual.

## Qué cambió después

- **Datos:** de una planilla de Excel compartida a una base SQLite propia, con importación de planillas.
- **Aplicación:** de una página servida por PowerShell a una app de escritorio con Electron (editor y Visor).
- **Código:** de un archivo de 2.100 líneas a tres capas (reglas de negocio, infraestructura e interfaz),
  con pruebas automáticas.
- **Uso:** de una inmobiliaria puntual a una versión general que cualquier inmobiliaria puede usar con su marca.
