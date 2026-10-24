// Reglas de estilo y calidad del codigo (npm run lint). Cada capa tiene su entorno:
// dominios = JavaScript puro, interfaz = navegador, infraestructura/pruebas/scripts = Node.
const js = require('@eslint/js');
const globals = require('globals');

const reglas = {
  'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
  'object-shorthand': ['error', 'properties'],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  // Formato basico (el resto lo indica .editorconfig)
  'no-tabs': 'error',
  'no-trailing-spaces': 'error',
  'eol-last': 'error',
  semi: ['error', 'always'],
  quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
};

module.exports = [
  { ignores: ['node_modules/', 'dist/', 'dist-visor/', 'docs/'] },
  js.configs.recommended,
  { rules: reglas },
  {
    files: ['src/dominios/**/*.js'],
    languageOptions: { sourceType: 'module', globals: {} },
  },
  {
    files: ['src/interfaz/js/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, Theme: 'readonly', A11y: 'readonly' } },
  },
  {
    files: ['src/interfaz/tema.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['src/infraestructura/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // Las pruebas ejecutan funciones dentro de la ventana (page.evaluate): ahi existen estos nombres.
    files: ['test/**/*.js', 'scripts/**/*.js'],
    languageOptions: { globals: { ...globals.browser, app: 'readonly', A11y: 'readonly', Theme: 'readonly', axe: 'readonly' } },
  },
];
