# Changelog

Todas las versiones siguen [SemVer](https://semver.org/lang/es/). Cada versión tiene su tag `vX.Y.Z` en git.

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
