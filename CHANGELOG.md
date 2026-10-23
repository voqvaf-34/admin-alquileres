# Changelog

Todas las versiones siguen [SemVer](https://semver.org/lang/es/). Cada versión tiene su tag `vX.Y.Z` en git.

## [0.7.0] - 2026-10-22

### Agregado
- **Modo claro u oscuro automático**: por defecto sigue al de Windows (y cambia junto con él). En Apariencia y en el
  asistente se puede elegir Automático, Claro u Oscuro; el botón ☾ de arriba sigue funcionando como atajo.
- **Asistente de primer uso**: al abrir la app por primera vez guía la marca (nombre, logo, ícono) y la apariencia.
  Se puede saltear.
- **Apariencia** en Configuración (ahora en pestañas: Marca, Apariencia, Mensajes):
  - Color secundario para la pestaña activa, los avisos y los títulos.
  - Seis temas, cada uno en claro y oscuro: Clásico, Cálido, Pizarra, Fresco, Con mi color y Alto contraste.
  - Seis tipografías empaquetadas con la app (Rubik, Inter, Montserrat, Nunito, Lora y la de Windows).
  - Vista previa más completa, que se puede ver en modo oscuro.
- **Ícono de la app** (ventana, barra de tareas y bandeja): seis diseños prediseñados con el color que se elija,
  generado desde el logo, o una imagen propia cuadrada.
- **Importar planilla con la app en uso** (menú ☰): agregar a lo que ya hay sin repetir contratos, o reemplazar todo.

### Corregido
- Deshacer: las importaciones son siempre un paso propio, y cancelar el diálogo de archivo ya no deja un paso vacío.

## [0.6.0] - 2026-10-21

### Agregado
- **Importar planilla con encabezados** (Excel o CSV): las columnas se reconocen por su nombre, en cualquier orden y
  con varios nombres posibles ("Dirección", "Domicilio", "Inmueble"...). Obligatorias: Dirección y Alquiler actual.
  Fechas en dd/mm/aaaa, aaaa-mm-dd, mm/aaaa o formato fecha de Excel; moneda UYU/USD; Estado Activo/Inactivo.
- **Planilla modelo** para descargar (pantalla de inicio y menú ☰): encabezados, dos filas de ejemplo, hoja de
  administraciones e instrucciones.
- Los CSV se leen bien con tildes tanto en UTF-8 como en ANSI (los que guarda Excel en Windows).

### Cambiado
- La planilla con columnas por posición de la app original sigue funcionando ("formato clásico"). Solo con ese formato
  se aplican sus ajustes automáticos (dólares si el importe tiene hasta 4 cifras, borrar inactivos sin contacto).

## [0.5.0] - 2026-10-21

### Quitado
- Funciones que solo servían para la migración interna de la inmobiliaria original: "Importar marcas"
  (desde la herramienta HTML anterior), "Copiar los datos de la app instalada" y el modo especial de la copia de prueba.

### Agregado
- Vuelve la prueba E2E del Visor (antes dependía de datos reales): el editor carga los datos de ejemplo, configura
  una marca y publica; el Visor muestra los mismos datos y la misma marca, en solo lectura, y se actualiza solo.

## [0.4.0] - 2026-10-21

### Agregado
- **Datos de ejemplo**: en la pantalla de inicio, "Probar con datos de ejemplo" carga una inmobiliaria inventada
  (21 alquileres, 12 propietarios, 3 administraciones). Las fechas se calculan desde hoy, así siempre hay aumentos
  del mes, renovaciones próximas, un vencido sin resolver, garantías que gestionan solas, un apto ya renovado
  (con línea de tiempo), alquileres en dólares e inactivos. Pasan por las mismas normalizaciones que una importación
  y se pueden deshacer.
- Pruebas unitarias de los datos de ejemplo con distintas fechas y prueba E2E que recorre todas las pestañas.

## [0.3.0] - 2026-10-21

### Agregado
- **Plantillas de mensajes** en Configuración: aviso de renovación, aumento al inquilino y aumento al propietario.
  Variables entre llaves (`{inmobiliaria}`, `{vencimiento}`, `{porcentaje}`, `{nuevo_importe}`, `{direccion}`,
  `{inquilino}`, `{propietario}`) que se insertan con un clic, ejemplo en vivo con datos inventados y aviso si
  se usa una variable que el mensaje no conoce.
- "Restaurar texto original": un mensaje sin cambios se guarda vacío, así le llegan las mejoras futuras del texto por defecto.

### Cambiado
- Los mensajes usan el nombre de la inmobiliaria configurado (antes, texto fijo).

## [0.2.0] - 2026-10-21

### Agregado
- **Configuración** (menú ☰ → Configuración…): nombre de la inmobiliaria, color principal y logo, con vista previa.
- Toda la interfaz se pinta a partir del color elegido: barra superior (incluida la barra de Windows), botones,
  pestañas e indicadores. El texto de la barra pasa a oscuro si el color es muy claro, y los textos de acento
  se ajustan para leerse bien en tema claro y oscuro (contraste WCAG).
- El logo se achica al guardarlo y queda dentro de la base, así el Visor muestra la misma marca.
- La marca se recuerda para el próximo arranque (sin destello de otro color al abrir).
- Pruebas unitarias de la paleta y prueba E2E de la configuración.

## [0.1.0] - 2026-10-21

Punto de partida de la versión general, a partir de una app interna usada por una inmobiliaria.

### Cambiado
- Sin datos de la inmobiliaria original: reglas de direcciones y propietarios vacías, sin logo ni nombre de la empresa (texto genérico "Mi Inmobiliaria"), íconos neutros.
- Sin carpeta compartida por defecto: se elige desde la app.
- Pruebas solo con datos inventados; se agrega una prueba E2E de primer arranque.
