const test   = require('node:test');
const assert = require('node:assert/strict');
const D      = require('../../src/dominios/index.js');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('marca: sin configuracion usa nombre y color por defecto', () => {
  assert.deepEqual(D.leerMarca({}), D.MARCA_DEFAULT);
  assert.deepEqual(D.leerMarca({ marcaNombre: '  ', marcaColor: 'rojo', marcaLogo: 'http://x/logo.png' }), D.MARCA_DEFAULT);
});

test('marca: lee nombre, color (en mayusculas) y logo guardados', () => {
  const m = D.leerMarca({ marcaNombre: 'Inmobiliaria Sur', marcaColor: '#0f766e', marcaLogo: PNG });
  assert.deepEqual(m, { nombre: 'Inmobiliaria Sur', color: '#0F766E', logo: PNG });
});

test('marca: valida lo que se guarda desde Configuracion', () => {
  assert.deepEqual(D.marcaASettings({ nombre: '  Inmobiliaria   Sur ', color: '#0f766e', logo: '' }),
    { marcaNombre: 'Inmobiliaria Sur', marcaColor: '#0F766E', marcaLogo: '' });
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: 'azul' }), /Color/);
  assert.throws(() => D.marcaASettings({ nombre: 'x'.repeat(61), color: '#000000' }), /60/);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', logo: 'data:text/html;base64,PGI+' }), /imagen/);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', logo: 'data:image/png;base64,' + 'A'.repeat(D.LOGO_MAX_CHARS) }), /grande/);
});

test('paleta: texto de la barra blanco u oscuro segun el color', () => {
  assert.equal(D.paleta('#2563EB').headerInk, '#FFFFFF');
  assert.equal(D.paleta('#FD4108').headerInk, '#FFFFFF');   // naranja: blanco (contraste >= 3)
  assert.equal(D.paleta('#FACC15').headerInk, '#1A1A1A');   // amarillo: oscuro
  assert.equal(D.paleta('#FACC15').headerFg, '26,26,26');
});

test('paleta: los textos de acento se leen sobre fondo claro y oscuro (contraste 4.5)', () => {
  for (const c of [...D.COLORES_SUGERIDOS, '#FACC15', '#A3E635', '#111111', '#FFFFFF']) {
    const p = D.paleta(c);
    assert.ok(D.contraste(p.accentInk, '#FFFFFF') >= 4.5, `${c} claro: ${p.accentInk}`);
    assert.ok(D.contraste(p.accentInkDark, '#0D0D0D') >= 4.5, `${c} oscuro: ${p.accentInkDark}`);
  }
});

test('paleta: color invalido cae al de por defecto', () => {
  assert.deepEqual(D.paleta('nada'), D.paleta(D.MARCA_DEFAULT.color));
});
