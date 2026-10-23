const test   = require('node:test');
const assert = require('node:assert/strict');
const D      = require('../../src/dominios/index.js');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('marca: sin configuracion usa nombre y color por defecto', () => {
  assert.deepEqual(D.leerMarca({}), D.MARCA_DEFAULT);
  assert.deepEqual(D.leerMarca({ marcaNombre: '  ', marcaColor: 'rojo', marcaLogo: 'http://x/logo.png' }), D.MARCA_DEFAULT);
});

test('marca: lee nombre, colores (en mayusculas), logo, tema, tipografia e icono guardados', () => {
  const m = D.leerMarca({ marcaNombre: 'Inmobiliaria Sur', marcaColor: '#0f766e', marcaColor2: '#ea580c', marcaLogo: PNG,
    marcaTema: 'calido', marcaFuente: 'lora', marcaIconoTipo: 'app', marcaIconoDiseno: 'casa', marcaIconoColor: '#be123c' });
  assert.deepEqual(m, { nombre: 'Inmobiliaria Sur', color: '#0F766E', color2: '#EA580C', logo: PNG, tema: 'calido', fuente: 'lora',
    icono: { tipo: 'app', diseno: 'casa', color: '#BE123C', imagen: '' } });
  // Tema, tipografia o diseño desconocidos caen a los de por defecto; "Mi logo" sin logo vuelve al prediseñado.
  const d = D.leerMarca({ marcaTema: 'neon', marcaFuente: 'comic', marcaIconoTipo: 'logo', marcaIconoDiseno: 'cohete' });
  assert.deepEqual([d.tema, d.fuente, d.icono.tipo, d.icono.diseno], ['clasico', 'rubik', 'app', 'edificio']);
  assert.equal(D.leerMarca({ marcaIconoTipo: 'imagen' }).icono.tipo, 'app', 'imagen propia sin imagen');
  assert.equal(D.leerMarca({ marcaIconoTipo: 'imagen', marcaIconoImagen: PNG }).icono.tipo, 'imagen');
});

test('marca: valida lo que se guarda desde Configuracion', () => {
  assert.deepEqual(D.marcaASettings({ nombre: '  Inmobiliaria   Sur ', color: '#0f766e', logo: '' }),
    { marcaNombre: 'Inmobiliaria Sur', marcaColor: '#0F766E', marcaColor2: '', marcaLogo: '', marcaTema: 'clasico', marcaFuente: 'rubik',
      marcaIconoTipo: 'app', marcaIconoDiseno: 'edificio', marcaIconoColor: '', marcaIconoImagen: '' });
  // Secundario igual al principal = vacio.
  const s = D.marcaASettings({ nombre: 'x', color: '#0F766E', color2: '#0f766e', logo: PNG, tema: 'marca', fuente: 'inter',
    icono: { tipo: 'logo', diseno: 'llave', color: '#ea580c' } });
  assert.deepEqual([s.marcaColor2, s.marcaTema, s.marcaFuente, s.marcaIconoTipo, s.marcaIconoDiseno, s.marcaIconoColor],
    ['', 'marca', 'inter', 'logo', 'llave', '#EA580C']);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', icono: { tipo: 'logo' } }), /cargar un logo/);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', icono: { tipo: 'imagen' } }), /imagen del icono/);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', icono: { diseno: 'cohete' } }), /Diseño/);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', icono: { tipo: 'imagen', imagen: 'data:image/jpeg;base64,AAAA' } }), /PNG/);
  assert.equal(D.marcaASettings({ nombre: 'x', color: '#000000', icono: { tipo: 'imagen', imagen: PNG } }).marcaIconoImagen, PNG);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', color2: 'verde' }), /secundario/);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', tema: 'neon' }), /Tema/);
  assert.throws(() => D.marcaASettings({ nombre: 'x', color: '#000000', fuente: 'comic' }), /Tipografia/);
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

test('paleta: color secundario (o el principal si no hay) legible en claro y oscuro', () => {
  const p = D.paleta('#0F766E', '#FACC15');
  assert.equal(p.sec, '#FACC15');
  assert.equal(p.secOn, '#1A1A1A', 'texto oscuro sobre amarillo');
  assert.ok(D.contraste(p.secInk, '#FFFFFF') >= 4.5);
  assert.ok(D.contraste(p.secInkDark, '#0D0D0D') >= 4.5);
  assert.equal(D.paleta('#0F766E').sec, '#0F766E');
});

test('paleta: tema "Con mi color" tiñe los fondos con el color de la marca', () => {
  const p = D.paleta('#0F766E');
  assert.ok(D.contraste(p.tinteBg, '#1A1A1A') >= 12, 'fondo claro con texto oscuro');
  assert.ok(D.contraste(p.tinteBgDark, '#E8E8E8') >= 12, 'fondo oscuro con texto claro');
  assert.notEqual(p.tinteBg, '#FFFFFF');
});

test('temas y tipografias: todos tienen nombre; las fuentes tienen respaldo', () => {
  for (const t of Object.values(D.TEMAS)) assert.ok(t.nombre);
  for (const f of Object.values(D.FUENTES)) assert.match(f.css, /(sans-serif|serif)$/);
  assert.ok(D.TEMAS[D.MARCA_DEFAULT.tema] && D.FUENTES[D.MARCA_DEFAULT.fuente]);
});
