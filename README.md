# Admin Alquileres

App de escritorio para administrar alquileres de una inmobiliaria: contratos, propietarios,
administraciones de edificios, aumentos por IPC y renovaciones de contratos.

> En desarrollo: la app nació como herramienta interna de una inmobiliaria y se está
> convirtiendo en una versión general que cualquier inmobiliaria pueda usar con su propia marca.

## Tecnología

- [Electron](https://www.electronjs.org/) + SQLite ([sql.js](https://sql.js.org/))
- JavaScript con módulos ES, sin frameworks de interfaz
- Pruebas con `node:test` y [Playwright](https://playwright.dev/) (E2E sobre la app real)

## Uso

```bash
npm install
npm start            # abre la app
npm test             # pruebas unitarias
npm run test:e2e     # pruebas de punta a punta
npm run dist         # instalador para Windows (dist/)
```
