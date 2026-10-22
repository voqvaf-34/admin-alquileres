# Changelog

Todas las versiones siguen [SemVer](https://semver.org/lang/es/). Cada versión tiene su tag `vX.Y.Z` en git.

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
