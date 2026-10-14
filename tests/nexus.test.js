'use strict';

process.env.NEXUS_SILENT = '1';
process.env.JWT_SECRET = 'secreto-de-pruebas-nexus';

const test = require('node:test');
const assert = require('node:assert/strict');

const {crearApp} = require('../server');
const {reiniciar, datosDe, db} = require('../core/database');
const {firmarJwt, verificarJwt, hashPassword, verificarPassword} = require('../core/security');
const analitica = require('../modules/motor_analitico/analytics.service');

const PASSWORD = 'Nexus#2026';
let servidor;
let base;

test.before(async () => {
  servidor = crearApp().listen(0);
  await new Promise((resolve) => servidor.once('listening', resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(() => servidor.close());
test.beforeEach(() => reiniciar());

async function api(token, metodo, ruta, cuerpo) {
  const respuesta = await fetch(base + ruta, {
    method: metodo,
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch (error) {
    datos = null;
  }
  return {status: respuesta.status, datos};
}

async function entrar(empresaId, email, password = PASSWORD) {
  const r = await api(null, 'POST', '/api/auth/login', {empresaId, email, password});
  assert.equal(r.status, 200, `login de ${email}: ${JSON.stringify(r.datos)}`);
  return r.datos.token;
}

const admin = (empresa = 'alfa') => entrar(empresa, empresa === 'alfa' ? 'carolina.mejia@alfa.test' : 'diego.rincon@beta.test');

/* ------------------------------ Seguridad: contraseñas y JWT ------------------------------ */

test('la contraseña se almacena con scrypt y nunca en texto plano', async () => {
  const hash = await hashPassword('Clave-Segura1');
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.ok(!hash.includes('Clave-Segura1'));
  assert.equal(await verificarPassword('Clave-Segura1', hash), true);
  assert.equal(await verificarPassword('otra-clave', hash), false);
  assert.ok(db.usuarios.every((u) => u.hash.startsWith('scrypt$') && !u.hash.includes(PASSWORD)));
});

test('el JWT HS256 rechaza firmas alteradas, expirados y algoritmos no permitidos', () => {
  const token = firmarJwt({sub: 1, cid: 'alfa'});
  assert.equal(verificarJwt(token).payload.cid, 'alfa');

  const [h, p, f] = token.split('.');
  const alterado = Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(p, 'base64url')), cid: 'beta'})).toString('base64url');
  assert.throws(() => verificarJwt(`${h}.${alterado}.${f}`), (e) => e.codigo === 'TOKEN_FIRMA_INVALIDA');

  assert.throws(() => verificarJwt(firmarJwt({sub: 1}, {duracion: -10})), (e) => e.codigo === 'TOKEN_EXPIRADO');

  const sinFirma = `${Buffer.from(JSON.stringify({alg: 'none', typ: 'JWT'})).toString('base64url')}.${p}.`;
  assert.throws(() => verificarJwt(sinFirma), (e) => e.codigo === 'TOKEN_ALGORITMO');
  assert.throws(() => verificarJwt(firmarJwt({sub: 1}, {secreto: 'otro-secreto'})), (e) => e.codigo === 'TOKEN_FIRMA_INVALIDA');
});

/* ------------------------------ Autenticación y registro ------------------------------ */

test('login correcto devuelve un JWT con empresa y rol, y las rutas exigen el token', async () => {
  const r = await api(null, 'POST', '/api/auth/login', {empresaId: 'alfa', email: 'laura.gomez@alfa.test', password: PASSWORD});
  assert.equal(r.status, 200);
  assert.equal(r.datos.claims.cid, 'alfa');
  assert.equal(r.datos.claims.rol, 'finanzas');
  assert.equal(r.datos.usuario.hash, undefined);
  assert.equal((await api(null, 'GET', '/api/crm/clientes')).datos.error, 'TOKEN_AUSENTE');
  assert.equal((await api('abc.def.ghi', 'GET', '/api/crm/clientes')).status, 401);
});

test('credenciales inválidas dan el mismo error, sin revelar si existe la empresa o el usuario', async () => {
  const a = await api(null, 'POST', '/api/auth/login', {empresaId: 'alfa', email: 'carolina.mejia@alfa.test', password: 'incorrecta1'});
  const b = await api(null, 'POST', '/api/auth/login', {empresaId: 'alfa', email: 'nadie@alfa.test', password: PASSWORD});
  const c = await api(null, 'POST', '/api/auth/login', {empresaId: 'no-existe', email: 'x@y.com', password: PASSWORD});
  for (const r of [a, b, c]) {
    assert.equal(r.status, 401);
    assert.equal(r.datos.error, 'CREDENCIALES_INVALIDAS');
  }
});

test('tras 5 intentos fallidos la cuenta se bloquea aunque luego se use la clave correcta', async () => {
  for (let i = 0; i < 5; i += 1) await api(null, 'POST', '/api/auth/login', {empresaId: 'beta', email: 'valeria.ortiz@beta.test', password: 'mala-clave-1'});
  const r = await api(null, 'POST', '/api/auth/login', {empresaId: 'beta', email: 'valeria.ortiz@beta.test', password: PASSWORD});
  assert.equal(r.status, 429);
  assert.equal(r.datos.error, 'CUENTA_BLOQUEADA');
});

test('registrar una empresa nueva crea un entorno aislado, vacío y con su administrador', async () => {
  const registro = await api(null, 'POST', '/api/auth/registro', {
    empresa: {nombre: 'Comercializadora Gamma S.A.S.', nit: '900555111-6'},
    admin: {nombre: 'Gabriela Mora', email: 'gabriela@gamma.test', password: 'GammaClave2026'}
  });
  assert.equal(registro.status, 201);
  assert.equal(registro.datos.empresa.id, 'comercializadora-gamma-s-a-s');
  assert.equal(registro.datos.usuario.rol, 'admin');
  const token = registro.datos.token;
  assert.equal((await api(token, 'GET', '/api/crm/clientes')).datos.total, 0);
  assert.equal((await api(token, 'GET', '/api/crm/pipeline')).datos.resumen.pipelineAbierto, 0);
  assert.equal((await api(token, 'GET', '/api/finanzas/facturas')).datos.error, 'MODULO_INACTIVO');
  const menu = (await api(token, 'GET', '/api/store/menu')).datos;
  assert.deepEqual(menu.visibles, ['ventas_crm']);
  const duplicada = await api(null, 'POST', '/api/auth/registro', {empresa: {nombre: 'Otra', nit: '900555111-6'}, admin: {nombre: 'Alguien Más', email: 'a@b.com', password: 'ClaveValida1'}});
  assert.equal(duplicada.datos.error, 'EMPRESA_DUPLICADA');
  const debil = await api(null, 'POST', '/api/auth/registro', {empresa: {nombre: 'Delta Ltda', nit: '901000222-7'}, admin: {nombre: 'Dora Díaz', email: 'd@d.com', password: 'corta'}});
  assert.equal(debil.datos.error, 'PASSWORD_DEBIL');
  const nitMalo = await api(null, 'POST', '/api/auth/registro', {empresa: {nombre: 'Delta Ltda', nit: '901000222-1'}, admin: {nombre: 'Dora Díaz', email: 'd@d.com', password: 'ClaveValida1'}});
  assert.equal(nitMalo.status, 422);
});

test('cada usuario cambia su contraseña y la anterior deja de servir', async () => {
  const token = await entrar('alfa', 'sandra.ruiz@alfa.test');
  assert.equal((await api(token, 'POST', '/api/auth/cambiar-password', {actual: 'equivocada1', nueva: 'NuevaClave2026'})).datos.error, 'PASSWORD_ACTUAL_INCORRECTA');
  assert.equal((await api(token, 'POST', '/api/auth/cambiar-password', {actual: PASSWORD, nueva: 'debil'})).datos.error, 'PASSWORD_DEBIL');
  assert.equal((await api(token, 'POST', '/api/auth/cambiar-password', {actual: PASSWORD, nueva: 'NuevaClave2026'})).status, 200);
  assert.equal((await api(null, 'POST', '/api/auth/login', {empresaId: 'alfa', email: 'sandra.ruiz@alfa.test', password: PASSWORD})).status, 401);
  assert.equal((await api(null, 'POST', '/api/auth/login', {empresaId: 'alfa', email: 'sandra.ruiz@alfa.test', password: 'NuevaClave2026'})).status, 200);
});

test('el administrador crea usuarios con clave temporal y no puede quedarse sin administradores', async () => {
  const token = await admin();
  const nuevo = await api(token, 'POST', '/api/auth/usuarios', {nombre: 'Tomás Vega', email: 'tomas.vega@alfa.test', rol: 'ventas'});
  assert.equal(nuevo.status, 201);
  assert.match(nuevo.datos.passwordTemporal, /^[A-Za-z2-9]{5}-[A-Za-z2-9]{4}\d{2}$/);
  assert.equal(nuevo.datos.usuario.debeCambiarPassword, true);
  assert.equal((await api(null, 'POST', '/api/auth/login', {empresaId: 'alfa', email: 'tomas.vega@alfa.test', password: nuevo.datos.passwordTemporal})).status, 200);
  const yo = (await api(token, 'GET', '/api/auth/yo')).datos.usuario;
  assert.equal((await api(token, 'PATCH', `/api/auth/usuarios/${yo.id}`, {activo: false})).datos.error, 'AUTOEXCLUSION');
  const soloVentas = await entrar('alfa', 'andres.pineda@alfa.test');
  assert.equal((await api(soloVentas, 'GET', '/api/auth/usuarios')).datos.error, 'SOLO_ADMINISTRADOR');
});

/* ------------------------------ Aislamiento multi-empresa ------------------------------ */

test('Alfa y Beta tienen datos totalmente distintos y nunca se mezclan', async () => {
  const alfa = await admin('alfa');
  const beta = await admin('beta');
  const clientesAlfa = (await api(alfa, 'GET', '/api/crm/clientes')).datos.clientes;
  const clientesBeta = (await api(beta, 'GET', '/api/crm/clientes')).datos.clientes;
  assert.equal(clientesAlfa.length, 10);
  assert.equal(clientesBeta.length, 4);
  assert.ok(clientesAlfa.every((c) => !clientesBeta.some((b) => b.nit === c.nit)));
  assert.equal(clientesBeta[0].id, 1);
  const fichaAjena = await api(beta, 'GET', '/api/crm/clientes/9/ficha');
  assert.equal(fichaAjena.status, 404);
  const creado = await api(beta, 'POST', '/api/crm/clientes', {razonSocial: 'Cliente Solo Beta', nit: '900123456-8', contacto: 'Contacto Beta', correo: 'c@beta.test', telefono: '+50760001111', fechaCumpleanos: '1990-01-01', ciudad: 'Panamá'});
  assert.equal(creado.status, 201, 'el mismo NIT puede existir en otra empresa');
  assert.equal((await api(alfa, 'GET', '/api/crm/clientes')).datos.total, 10);
});

test('un token alterado para apuntar a otra empresa se rechaza y no hay forma de elegir la empresa por parámetro', async () => {
  const beta = await admin('beta');
  const [h, p, f] = beta.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  const falso = `${h}.${Buffer.from(JSON.stringify({...claims, cid: 'alfa'})).toString('base64url')}.${f}`;
  assert.equal((await api(falso, 'GET', '/api/crm/clientes')).datos.error, 'TOKEN_FIRMA_INVALIDA');
  const conParametro = await api(beta, 'GET', '/api/crm/clientes?empresaId=alfa&company_id=alfa');
  assert.equal(conParametro.datos.total, 4);
  const intento = await api(beta, 'POST', '/api/trazabilidad/prueba-aislamiento', {empresaObjetivo: 'alfa'});
  assert.equal(intento.status, 403);
  assert.equal(intento.datos.error, 'AISLAMIENTO_MULTIEMPRESA');
  assert.equal((await api(beta, 'POST', '/api/trazabilidad/prueba-aislamiento', {empresaObjetivo: 'beta'})).status, 200);
});

test('la verificación pública del QR solo expone lo mínimo y funciona sin sesión', async () => {
  const factura = datosDe('alfa').facturas[0];
  const ok = await api(null, 'GET', `/api/verificar/${factura.codigoVerificacion}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.datos.valida, true);
  assert.equal(ok.datos.numero, factura.numero);
  assert.equal(ok.datos.items, undefined);
  assert.equal((await api(null, 'GET', '/api/verificar/NOEXISTE123')).status, 404);
});

/* ------------------------------ Roles (RBAC) ------------------------------ */

test('cada rol ve en el menú solo los módulos activos de su empresa que le corresponden', async () => {
  const menu = async (empresa, email) => (await api(await entrar(empresa, email), 'GET', '/api/store/menu')).datos.visibles;
  assert.deepEqual((await menu('alfa', 'carolina.mejia@alfa.test')).sort(), ['cadena_suministro', 'finanzas', 'marketing', 'motor_analitico', 'recursos_humanos', 'servicios', 'ventas_crm']);
  assert.deepEqual((await menu('alfa', 'luisa.ortega@alfa.test')).sort(), ['servicios', 'ventas_crm']);
  assert.deepEqual(await menu('alfa', 'sandra.ruiz@alfa.test'), ['recursos_humanos']);
  assert.deepEqual(await menu('beta', 'valeria.ortiz@beta.test'), ['ventas_crm']);
  assert.deepEqual((await menu('alfa', 'andres.pineda@alfa.test')).sort(), ['cadena_suministro', 'finanzas', 'ventas_crm'], 'ventas no ve marketing, soporte ni analítica');
  assert.deepEqual((await menu('alfa', 'pedro.salas@alfa.test')).sort(), ['cadena_suministro', 'ventas_crm'], 'inventario no ve finanzas');
  assert.deepEqual((await menu('alfa', 'laura.gomez@alfa.test')).sort(), ['finanzas', 'ventas_crm'], 'finanzas no ve existencias ni analítica');
  assert.deepEqual((await menu('beta', 'natalia.pozo@beta.test')), ['recursos_humanos']);
});

test('el backend bloquea lo que el menú oculta: sin acceso, solo lectura y administración', async () => {
  const soporte = await entrar('alfa', 'luisa.ortega@alfa.test');
  assert.equal((await api(soporte, 'GET', '/api/finanzas/facturas')).datos.error, 'ROL_SIN_ACCESO');
  assert.equal((await api(soporte, 'GET', '/api/rrhh/empleados')).datos.error, 'ROL_SIN_ACCESO');
  assert.equal((await api(soporte, 'POST', '/api/crm/clientes', {})).datos.error, 'ROL_SOLO_LECTURA');
  assert.equal((await api(soporte, 'GET', '/api/crm/clientes')).status, 200);
  const ventas = await entrar('alfa', 'andres.pineda@alfa.test');
  assert.equal((await api(ventas, 'GET', '/api/finanzas/facturas')).status, 200);
  assert.equal((await api(ventas, 'POST', '/api/finanzas/facturas', {})).datos.error, 'ROL_SOLO_LECTURA');
  assert.equal((await api(ventas, 'POST', '/api/store/apps/marketing/desactivar')).datos.error, 'SOLO_ADMINISTRADOR');
  const rrhh = await entrar('alfa', 'sandra.ruiz@alfa.test');
  assert.equal((await api(rrhh, 'GET', '/api/crm/clientes')).datos.error, 'ROL_SIN_ACCESO');
  assert.equal((await api(rrhh, 'GET', '/api/rrhh/resumen')).status, 200);
});

test('la ficha 360° solo incluye las secciones que el rol y los módulos activos permiten', async () => {
  const ventas = (await api(await entrar('alfa', 'andres.pineda@alfa.test'), 'GET', '/api/crm/clientes/1/ficha')).datos;
  assert.ok(Array.isArray(ventas.facturas));
  assert.equal(ventas.tickets, null, 'ventas ya no ve las órdenes de soporte');
  const soporte = (await api(await entrar('alfa', 'luisa.ortega@alfa.test'), 'GET', '/api/crm/clientes/1/ficha')).datos;
  assert.equal(soporte.facturas, null);
  assert.ok(Array.isArray(soporte.tickets));
  assert.ok(soporte.seccionesNoDisponibles.some((s) => s.seccion === 'facturas' && s.modulo === 'finanzas'));
  const beta = (await api(await entrar('beta', 'valeria.ortiz@beta.test'), 'GET', '/api/crm/clientes/1/ficha')).datos;
  assert.equal(beta.facturas, null);
  assert.ok(beta.seccionesNoDisponibles.some((s) => s.motivo.includes('no está activo')));
});

/* ------------------------------ Roles configurables por el administrador de cada empresa ------------------------------ */

test('el administrador crea y ajusta roles de su empresa y el cambio aplica de inmediato sin tocar a otras empresas', async () => {
  const alfa = await admin('alfa');
  const beta = await admin('beta');
  const ventas = await entrar('alfa', 'andres.pineda@alfa.test');
  assert.equal((await api(ventas, 'GET', '/api/marketing/campanas')).datos.error, 'ROL_SIN_ACCESO');

  const ajuste = await api(alfa, 'PATCH', '/api/auth/roles/ventas', {permisos: {ventas_crm: 'rw', finanzas: 'r', cadena_suministro: 'r', marketing: 'r'}});
  assert.equal(ajuste.status, 200);
  assert.equal((await api(ventas, 'GET', '/api/marketing/campanas')).status, 200, 'el nuevo permiso aplica sin volver a iniciar sesión');
  assert.equal((await api(ventas, 'POST', '/api/marketing/campanas', {})).datos.error, 'ROL_SOLO_LECTURA');
  assert.equal(datosDe('beta').roles.ventas.permisos.marketing, undefined, 'Beta conserva su propia configuración');

  const nuevo = await api(alfa, 'POST', '/api/auth/roles', {nombre: 'Auxiliar de bodega', permisos: {cadena_suministro: 'r'}, inicio: 'inv_productos'});
  assert.equal(nuevo.status, 201);
  assert.equal(nuevo.datos.rol.id, 'auxiliar_de_bodega');
  assert.equal((await api(alfa, 'POST', '/api/auth/roles', {nombre: 'Auxiliar de bodega'})).datos.error, 'ROL_DUPLICADO');
  assert.equal((await api(alfa, 'POST', '/api/auth/roles', {nombre: 'Otro', permisos: {inexistente: 'rw'}})).status, 422);
  assert.equal((await api(alfa, 'POST', '/api/auth/roles', {nombre: 'Otro dos', permisos: {finanzas: 'r'}, inicio: 'inv_productos'})).status, 422, 'el inicio debe ser de un módulo permitido');

  const creado = await api(alfa, 'POST', '/api/auth/usuarios', {nombre: 'Bruno Bodega', email: 'bruno@alfa.test', rol: 'auxiliar_de_bodega', password: 'Bodega2026ok'});
  assert.equal(creado.status, 201);
  const bruno = await entrar('alfa', 'bruno@alfa.test', 'Bodega2026ok');
  assert.equal((await api(bruno, 'GET', '/api/inventario/productos')).status, 200);
  assert.equal((await api(bruno, 'POST', '/api/inventario/productos', {})).datos.error, 'ROL_SOLO_LECTURA');
  assert.equal((await api(bruno, 'GET', '/api/crm/clientes')).datos.error, 'ROL_SIN_ACCESO');
  assert.equal((await api(bruno, 'GET', '/api/store/menu')).datos.inicio, 'inv_productos');

  assert.equal((await api(alfa, 'DELETE', '/api/auth/roles/auxiliar_de_bodega')).datos.error, 'ROL_EN_USO');
  assert.equal((await api(alfa, 'PATCH', '/api/auth/roles/admin', {permisos: {}})).datos.error, 'ROL_DE_SISTEMA');
  assert.equal((await api(alfa, 'DELETE', '/api/auth/roles/admin')).datos.error, 'ROL_DE_SISTEMA');
  const id = creado.datos.usuario.id;
  assert.equal((await api(alfa, 'PATCH', `/api/auth/usuarios/${id}`, {rol: 'soporte'})).status, 200);
  assert.equal((await api(alfa, 'DELETE', '/api/auth/roles/auxiliar_de_bodega')).status, 200);
  assert.equal((await api(beta, 'POST', '/api/auth/usuarios', {nombre: 'Intruso Uno', email: 'x@beta.test', rol: 'auxiliar_de_bodega'})).status, 422, 'un rol de Alfa no existe en Beta');
  assert.equal((await api(ventas, 'POST', '/api/auth/roles', {nombre: 'Falso admin'})).datos.error, 'SOLO_ADMINISTRADOR');
});

test('una empresa nueva solo trae el rol de administrador y define sus propios cargos sobre los módulos activos', async () => {
  const registro = await api(null, 'POST', '/api/auth/registro', {empresa: {nombre: 'Zeta Servicios', nit: '901000444-5'}, admin: {nombre: 'Zoe Zapata', email: 'zoe@zeta.test', password: 'ZetaClave2026'}});
  assert.equal(registro.status, 201, JSON.stringify(registro.datos));
  const token = registro.datos.token;
  const lista = (await api(token, 'GET', '/api/auth/roles')).datos;
  assert.deepEqual(lista.roles.map((r) => r.id), ['admin']);
  assert.equal((await api(token, 'POST', '/api/auth/usuarios', {nombre: 'Ana Ayala', email: 'ana@zeta.test', rol: 'ventas'})).status, 422, 'no existen cargos hasta que el administrador los crea');
  const cargo = await api(token, 'POST', '/api/auth/roles', {nombre: 'Coordinadora comercial', permisos: {ventas_crm: 'rw'}});
  assert.equal(cargo.status, 201);
  const usuario = await api(token, 'POST', '/api/auth/usuarios', {nombre: 'Ana Ayala', email: 'ana@zeta.test', rol: cargo.datos.rol.id, password: 'AnaClave2026ok'});
  assert.equal(usuario.status, 201);
  const ana = await entrar(registro.datos.empresa.id, 'ana@zeta.test', 'AnaClave2026ok');
  assert.deepEqual((await api(ana, 'GET', '/api/store/menu')).datos.visibles, ['ventas_crm']);
});

test('el modo demostración acepta celulares de la red local y rechaza orígenes de internet', async () => {
  const pedir = async (origen) => (await fetch(`${base}/api/sistema/salud`, {headers: {Origin: origen}})).headers.get('access-control-allow-origin');
  assert.equal(await pedir('http://192.168.1.25:5173'), 'http://192.168.1.25:5173');
  assert.equal(await pedir('http://sitio-malicioso.example'), null);
  process.env.NEXUS_DEMO = 'false';
  try {
    assert.equal(await pedir('http://192.168.1.25:5173'), null, 'en producción solo se aceptan los orígenes configurados');
  } finally {
    delete process.env.NEXUS_DEMO;
  }
});

test('las herramientas de demostración son solo del administrador y reiniciar borra lo creado en la presentación', async () => {
  const alfa = await admin('alfa');
  const ventas = await entrar('alfa', 'andres.pineda@alfa.test');
  assert.equal((await api(ventas, 'GET', '/api/demo/acceso')).datos.error, 'SOLO_ADMINISTRADOR');
  assert.equal((await api(ventas, 'POST', '/api/demo/reiniciar')).datos.error, 'SOLO_ADMINISTRADOR');
  assert.ok(Array.isArray((await api(alfa, 'GET', '/api/demo/acceso')).datos.direcciones));
  await api(alfa, 'POST', '/api/auth/roles', {nombre: 'Cargo de prueba'});
  assert.ok(datosDe('alfa').roles.cargo_de_prueba);
  assert.equal((await api(alfa, 'POST', '/api/demo/reiniciar')).status, 200);
  assert.equal(datosDe('alfa').roles.cargo_de_prueba, undefined);
  assert.equal((await api(alfa, 'GET', '/api/store/menu')).status, 401, 'tras reiniciar hay que volver a iniciar sesión');
  const nueva = await admin('alfa');
  assert.equal((await api(nueva, 'GET', '/api/store/menu')).datos.demo, true);
  process.env.NEXUS_DEMO = 'false';
  try {
    assert.equal((await api(nueva, 'POST', '/api/demo/reiniciar')).datos.error, 'NO_DISPONIBLE');
    assert.equal((await api(nueva, 'GET', '/api/store/menu')).datos.demo, false);
  } finally {
    delete process.env.NEXUS_DEMO;
  }
});

/* ------------------------------ Tienda de Apps por empresa ------------------------------ */

test('activar un módulo solo cambia a la empresa que lo compra y habilita sus rutas y su menú', async () => {
  const beta = await admin('beta');
  const alfa = await admin('alfa');
  assert.equal((await api(beta, 'GET', '/api/finanzas/facturas')).datos.error, 'MODULO_INACTIVO');
  const activar = await api(beta, 'POST', '/api/store/apps/finanzas/activar', {});
  assert.equal(activar.status, 200);
  assert.deepEqual(activar.datos.activados, ['finanzas']);
  assert.equal(activar.datos.cobros[0].estado, 'aprobado');
  assert.equal((await api(beta, 'GET', '/api/finanzas/facturas')).status, 200);
  assert.ok((await api(beta, 'GET', '/api/store/menu')).datos.visibles.includes('finanzas'));
  assert.equal(datosDe('alfa').suscripciones.filter((s) => s.moduloId === 'finanzas').length, 1, 'Alfa no se alteró');
  assert.equal((await api(alfa, 'GET', '/api/store/apps')).datos.apps.find((a) => a.id === 'finanzas').activo, true);
});

test('las dependencias se activan juntas, no se puede quitar lo que otros necesitan y un pago rechazado no activa nada', async () => {
  const registro = await api(null, 'POST', '/api/auth/registro', {empresa: {nombre: 'Delta Comercial', nit: '901000222-7'}, admin: {nombre: 'Dora Díaz', email: 'dora@delta.test', password: 'DeltaClave2026'}});
  const token = registro.datos.token;
  const rechazo = await api(token, 'POST', '/api/store/apps/finanzas/activar', {simularRechazo: true});
  assert.equal(rechazo.status, 402);
  assert.equal(rechazo.datos.error, 'PAGO_RECHAZADO');
  assert.equal((await api(token, 'GET', '/api/finanzas/facturas')).datos.error, 'MODULO_INACTIVO');
  assert.equal((await api(token, 'POST', '/api/store/apps/marketing/activar', {})).datos.activados.length, 1);
  assert.equal((await api(token, 'POST', '/api/store/apps/ventas_crm/desactivar')).datos.error, 'TIENE_DEPENDIENTES');
  assert.equal((await api(token, 'POST', '/api/store/apps/marketing/desactivar')).status, 200);
  assert.equal((await api(token, 'GET', '/api/marketing/campanas')).datos.error, 'MODULO_INACTIVO');
  const cobros = (await api(token, 'GET', '/api/store/cobros')).datos;
  assert.ok(cobros.cobros.some((c) => c.estado === 'rechazado'));
});

test('la contratación se cotiza antes de pagar, el plan completo tiene descuento y solo el administrador puede comprar', async () => {
  const registro = await api(null, 'POST', '/api/auth/registro', {empresa: {nombre: 'Épsilon SAS', nit: '901000333-6'}, admin: {nombre: 'Elena Estrada', email: 'elena@epsilon.test', password: 'EpsilonClave2026'}});
  const token = registro.datos.token;
  const porModulo = await api(token, 'POST', '/api/store/cotizar', {plan: 'modulos', moduloIds: ['finanzas']});
  assert.equal(porModulo.status, 200);
  const activosAlInicio = (await api(token, 'GET', '/api/store/menu')).datos.activos.length;
  assert.deepEqual(porModulo.datos.compra.lineas.map((l) => l.moduloId), ['finanzas']);
  assert.equal(porModulo.datos.compra.ahorro, 0);
  const suite = await api(token, 'POST', '/api/store/cotizar', {plan: 'suite'});
  assert.equal(suite.datos.compra.lineas.length, 7 - activosAlInicio);
  assert.ok(suite.datos.compra.ahorro > 0 && suite.datos.compra.descuentoPct > 0);
  assert.equal((await api(token, 'GET', '/api/finanzas/facturas')).datos.error, 'MODULO_INACTIVO', 'cotizar no activa nada');

  const rechazo = await api(token, 'POST', '/api/store/comprar', {plan: 'suite', simularRechazo: true});
  assert.equal(rechazo.status, 402);
  assert.equal((await api(token, 'GET', '/api/store/menu')).datos.activos.length, activosAlInicio, 'un pago rechazado no activa ningún módulo');

  const pago = await api(token, 'POST', '/api/store/comprar', {plan: 'suite'});
  assert.equal(pago.status, 200);
  assert.equal(pago.datos.cobros.length, 7 - activosAlInicio);
  assert.ok(pago.datos.cobros.every((c) => c.estado === 'aprobado'));
  assert.equal(pago.datos.compra.total, suite.datos.compra.total);
  assert.equal((await api(token, 'GET', '/api/store/menu')).datos.activos.length, 7);
  assert.equal((await api(token, 'POST', '/api/store/comprar', {plan: 'suite'})).datos.error, 'NADA_QUE_CONTRATAR');

  const alfaVentas = await entrar('alfa', 'andres.pineda@alfa.test');
  assert.equal((await api(alfaVentas, 'POST', '/api/store/comprar', {plan: 'suite'})).datos.error, 'SOLO_ADMINISTRADOR');
  assert.equal((await api(alfaVentas, 'POST', '/api/store/cotizar', {plan: 'suite'})).datos.error, 'SOLO_ADMINISTRADOR');
});

/* ------------------------------ Sincronización inter-modular ------------------------------ */

test('facturar descuenta el stock, deja el kárdex, despacha el comprobante digital y queda trazado', async () => {
  const token = await admin();
  const stockAntes = datosDe('alfa').productos.find((p) => p.sku === 'LAC-001').stock;
  const r = await api(token, 'POST', '/api/finanzas/facturas', {clienteId: 2, items: [{sku: 'LAC-001', cantidad: 10}]});
  assert.equal(r.status, 201);
  assert.equal(r.datos.factura.estadoPago, 'Pendiente');
  assert.match(r.datos.factura.codigoVerificacion, /^[A-Z0-9_-]{12}$/);
  const inv = r.datos.efectos.find((e) => e.modulo === 'cadena_suministro');
  assert.equal(inv.estado, 'ok');
  assert.equal(datosDe('alfa').productos.find((p) => p.sku === 'LAC-001').stock, stockAntes - 10);
  const kardex = (await api(token, 'GET', '/api/inventario/movimientos')).datos.movimientos;
  assert.equal(kardex[0].tipo, 'salida');
  assert.equal(kardex[0].origen, `finanzas:${r.datos.factura.numero}`);
  assert.equal(r.datos.efectos.find((e) => e.modulo === 'finanzas').detalle.enviado, true);
  const mensaje = (await api(token, 'GET', '/api/marketing/mensajes?tipo=factura')).datos.mensajes[0];
  assert.equal(mensaje.payload.messaging_product, 'whatsapp');
  assert.equal(mensaje.payload.template.name, 'factura_digital');
  const logs = (await api(token, 'GET', '/api/trazabilidad/logs')).datos.logs.map((l) => l.mensaje).join('\n');
  assert.match(logs, /Factura Emitida -> Disparando reducción de stock en módulo Inventario/);
  assert.match(logs, /Factura Emitida -> Despachando el comprobante digital/);
});

test('la reserva lógica impide sobreventas y alimenta el indicador de quiebres', async () => {
  const token = await admin();
  const antes = datosDe('alfa').productos.find((p) => p.sku === 'LAC-005').stock;
  const facturasAntes = datosDe('alfa').facturas.length;
  const r = await api(token, 'POST', '/api/finanzas/facturas', {clienteId: 1, items: [{sku: 'LAC-005', cantidad: antes + 1}]});
  assert.equal(r.status, 409);
  assert.equal(r.datos.error, 'STOCK_INSUFICIENTE');
  assert.equal(datosDe('alfa').productos.find((p) => p.sku === 'LAC-005').stock, antes);
  assert.equal(datosDe('alfa').facturas.length, facturasAntes);
  const ind = (await api(token, 'GET', '/api/analitica/indicadores')).datos.indicadores;
  assert.equal(ind.sincronizacionStock.quiebres, 1);
  assert.equal(ind.sincronizacionStock.preventas, 1);
});

test('facturar una cotización aceptada es el único camino desde el ciclo de ventas y no se repite', async () => {
  const token = await admin();
  assert.equal((await api(token, 'POST', '/api/finanzas/facturas', {cotizacionId: 1})).datos.error, 'COTIZACION_NO_ACEPTADA');
  const r = await api(token, 'POST', '/api/finanzas/facturas', {cotizacionId: 3});
  assert.equal(r.status, 201);
  assert.equal(r.datos.factura.cotizacionId, 3);
  assert.equal((await api(token, 'POST', '/api/finanzas/facturas', {cotizacionId: 3})).datos.error, 'COTIZACION_YA_FACTURADA');
  const flujo = await api(token, 'POST', '/api/crm/cotizaciones', {oportunidadId: 3, items: [{sku: 'LAC-006', cantidad: 5}]});
  assert.equal(flujo.status, 201);
  const id = flujo.datos.cotizacion.id;
  assert.equal((await api(token, 'PATCH', `/api/crm/cotizaciones/${id}/estado`, {estado: 'aceptada'})).datos.error, 'TRANSICION_INVALIDA');
  await api(token, 'PATCH', `/api/crm/cotizaciones/${id}/estado`, {estado: 'enviada'});
  const aceptada = await api(token, 'PATCH', `/api/crm/cotizaciones/${id}/estado`, {estado: 'aceptada'});
  assert.equal(aceptada.status, 200);
  assert.equal(datosDe('alfa').oportunidades.find((o) => o.id === 3).etapa, 'ganado');
});

test('pagar una factura recalcula las métricas del cliente y envía la confirmación por el canal digital', async () => {
  const token = await admin();
  const pago = await api(token, 'POST', '/api/finanzas/facturas/4/pagar', {metodoPago: 'pse', referencia: 'PSE-123'});
  assert.equal(pago.status, 200);
  assert.equal(pago.datos.factura.estadoPago, 'Pagada');
  const efectos = Object.fromEntries(pago.datos.efectos.map((e) => [e.modulo, e]));
  assert.equal(efectos.motor_analitico.estado, 'ok');
  assert.equal(efectos.motor_analitico.detalle.actualizado, true);
  assert.equal(efectos.marketing.detalle.enviado, true);
  assert.equal((await api(token, 'POST', '/api/finanzas/facturas/4/pagar', {})).datos.error, 'YA_PAGADA');
});

test('sin el módulo de Inventario la facturación sigue funcionando y el evento queda omitido', async () => {
  const token = await admin('beta');
  await api(token, 'POST', '/api/store/apps/finanzas/activar', {});
  const r = await api(token, 'POST', '/api/finanzas/facturas', {clienteId: 1, items: [{descripcion: 'Plan de soporte técnico', cantidad: 1, precioUnitario: 1500000}]});
  assert.equal(r.status, 201);
  assert.equal(r.datos.efectos.find((e) => e.modulo === 'cadena_suministro').estado, 'omitido');
  assert.equal(datosDe('beta').productos.length, 0);
});

test('el estado de cuenta suma cargos y abonos y la cartera separa lo vencido', async () => {
  const token = await admin();
  const cuenta = (await api(token, 'GET', '/api/finanzas/estado-cuenta/9')).datos;
  assert.equal(cuenta.totales.saldo, cuenta.totales.facturado - cuenta.totales.pagado);
  assert.equal(cuenta.movimientos[cuenta.movimientos.length - 1].saldo, cuenta.totales.saldo);
  const cartera = (await api(token, 'GET', '/api/finanzas/cartera')).datos;
  assert.ok(cartera.totalVencido > 0 && cartera.totalVencido < cartera.totalPendiente);
});

/* ------------------------------ Motor analítico y marketing ------------------------------ */

test('el motor analítico segmenta con RFM y geografía, y las comisiones solo salen del recaudo', async () => {
  const token = await admin();
  const r = (await api(token, 'GET', '/api/analitica/clientes')).datos;
  assert.equal(r.total, 10);
  assert.ok(r.clientes.every((c) => c.score >= 0 && c.score <= 1 && ['AAA', 'AA', 'A', 'B', 'C'].includes(c.clase)));
  assert.ok(r.clientes[0].score >= r.clientes[r.clientes.length - 1].score);
  const sinCompras = r.clientes.find((c) => c.comprasEfectivas === 0);
  assert.equal(sinCompras.clase, 'C');
  const com = (await api(token, 'GET', '/api/analitica/comisiones')).datos.vendedores[0];
  assert.equal(com.comisionGenerada, Math.round(com.recaudado * com.comisionPct / 100));
  assert.ok(com.pendienteRecaudo > 0 && com.comisionRetenida > 0);
  const malos = await api(token, 'PUT', '/api/analitica/modelo', {wR: 0.5, wF: 0.5, wM: 0.5});
  assert.equal(malos.status, 422);
  assert.equal((await api(token, 'PUT', '/api/analitica/modelo', {wR: 0.2, wF: 0.5, wM: 0.3})).status, 200);
});

test('el planificador reserva primero el cupo de las facturas y reparte el resto por Score', async () => {
  const token = await admin();
  const una = (await api(token, 'POST', '/api/analitica/planificar', {cuota: 1})).datos.plan;
  assert.equal(una.facturas.length, 1);
  assert.equal(una.promociones.length, 0);
  const tres = (await api(token, 'POST', '/api/analitica/planificar', {cuota: 3, topePorCliente: null})).datos.plan;
  assert.equal(tres.facturas.length, 1);
  assert.equal(tres.promociones.length, 2);
  const incluidos = new Set(tres.promociones.map((p) => `${p.clienteId}-${p.campanaId}`));
  const todos = (await api(token, 'POST', '/api/analitica/planificar', {cuota: 100, topePorCliente: null})).datos.plan;
  const mejorExcluido = Math.max(...todos.promociones.filter((p) => !incluidos.has(`${p.clienteId}-${p.campanaId}`)).map((p) => p.score));
  assert.ok(Math.min(...tres.promociones.map((p) => p.score)) >= mejorExcluido);
});

test('el orden voraz por Score iguala al óptimo exhaustivo del modelo en instancias pequeñas', () => {
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 1664525 + 1013904223) % 4294967296;
    return semilla / 4294967296;
  };
  for (let caso = 0; caso < 60; caso += 1) {
    const clientes = Array.from({length: 4}, (_, i) => ({id: i + 1, score: Math.round(azar() * 100) / 100, canalDigital: azar() < 0.8, tipologia: 'minimercado', zona: 'urbana', clase: 'A'}));
    const campanas = Array.from({length: 2}, (_, i) => ({id: i + 1, tipologias: [], zonas: [], clases: []}));
    const facturasPorDespachar = Array.from({length: 3}, (_, i) => ({facturaId: i + 1, clienteId: 1 + Math.floor(azar() * 4)}));
    const cap = Math.floor(azar() * 8);
    const tope = [null, 1, 2][Math.floor(azar() * 3)];
    const plan = analitica.planificarEnvios({clientes, campanas, facturasPorDespachar, cap, topePorCliente: tope});

    const w = facturasPorDespachar.filter((f) => clientes[f.clienteId - 1].canalDigital);
    const z = [];
    for (const c of clientes) if (c.canalDigital) for (const k of campanas) z.push({c, k});
    let mejor = 0;
    for (let a = 0; a < 1 << w.length; a += 1) {
      for (let b = 0; b < 1 << z.length; b += 1) {
        const nw = w.filter((_, i) => a & (1 << i)).length;
        const elegidas = z.filter((_, i) => b & (1 << i));
        if (nw + elegidas.length > cap) continue;
        const porCliente = {};
        let valido = true;
        for (const e of elegidas) {
          porCliente[e.c.id] = (porCliente[e.c.id] || 0) + 1;
          if (tope !== null && porCliente[e.c.id] > tope) valido = false;
        }
        if (!valido) continue;
        mejor = Math.max(mejor, 100 * nw + elegidas.reduce((s, e) => s + e.c.score, 0));
      }
    }
    assert.ok(Math.abs(plan.objetivo - mejor) < 1e-6, `caso ${caso}: voraz ${plan.objetivo} vs óptimo ${mejor}`);
  }
});

test('una campaña respeta la cuota diaria, no repite promociones y deja el rastro del mensaje', async () => {
  const token = await admin();
  const cuotaAntes = (await api(token, 'GET', '/api/marketing/cuota')).datos.cuota;
  assert.equal(cuotaAntes.reservadoParaFacturas, 1);
  const ejecucion = await api(token, 'POST', '/api/marketing/campanas/1/ejecutar', {});
  assert.equal(ejecucion.status, 200);
  assert.equal(ejecucion.datos.plan.cuposReservadosParaFacturas, 1);
  assert.ok(ejecucion.datos.plan.promocionesEnviadas > 0);
  const cuota = (await api(token, 'GET', '/api/marketing/cuota')).datos.cuota;
  assert.ok(cuota.usadoHoy <= cuota.capDiaria);
  const segunda = await api(token, 'POST', '/api/marketing/campanas/1/ejecutar', {});
  assert.equal(segunda.datos.plan.promocionesEnviadas, 0, 'no se repite la promoción al mismo cliente');
  await api(token, 'PATCH', '/api/marketing/cuota', {capDiaria: 2});
  const nueva = await api(token, 'POST', '/api/marketing/campanas', {nombre: 'Prueba de cuota', mensaje: 'Mensaje de prueba de cuota diaria', tipologias: [], zonas: [], clases: []});
  const limitada = await api(token, 'POST', `/api/marketing/campanas/${nueva.datos.campana.id}/ejecutar`, {});
  assert.equal(limitada.datos.plan.promocionesEnviadas, 0, 'con la cuota agotada no se envían promociones');
  const estado = (await api(token, 'GET', '/api/marketing/mensajes?tipo=promocion')).datos.mensajes[0];
  assert.equal(estado.payload.type, 'template');
});

/* ------------------------------ Servicios, RR. HH. y trazabilidad ------------------------------ */

test('las órdenes de soporte conservan su trazabilidad, su SLA y su historial completo', async () => {
  const token = await entrar('alfa', 'luisa.ortega@alfa.test');
  const creado = await api(token, 'POST', '/api/servicios/tickets', {clienteId: 1, asunto: 'Producto con fecha de vencimiento corta', prioridad: 'alta', facturaId: 1});
  assert.equal(creado.status, 201);
  assert.equal(creado.datos.ticket.slaHoras, 24);
  const id = creado.datos.ticket.id;
  assert.equal((await api(token, 'POST', '/api/servicios/tickets', {clienteId: 1, asunto: 'Factura de otro cliente', facturaId: 2})).datos.error, 'FACTURA_NO_VINCULABLE');
  await api(token, 'POST', `/api/servicios/tickets/${id}/asignar`, {});
  await api(token, 'POST', `/api/servicios/tickets/${id}/comentarios`, {texto: 'Se contactó al cliente para programar el cambio.'});
  const resuelto = await api(token, 'PATCH', `/api/servicios/tickets/${id}/estado`, {estado: 'resuelto'});
  assert.equal(resuelto.datos.ticket.cumpleSla, true);
  assert.deepEqual(resuelto.datos.ticket.historial.map((h) => h.tipo), ['creado', 'asignado', 'comentario', 'estado']);
  assert.equal((await api(token, 'PATCH', `/api/servicios/tickets/${id}/estado`, {estado: 'resuelto'})).datos.error, 'SIN_CAMBIO');
  assert.ok((await api(token, 'GET', '/api/servicios/resumen')).datos.slaVencidos >= 1);
});

test('Recursos Humanos gestiona perfiles, evaluaciones y resumen de nómina por empresa', async () => {
  const token = await entrar('alfa', 'sandra.ruiz@alfa.test');
  const nuevo = await api(token, 'POST', '/api/rrhh/empleados', {nombre: 'Camila Torres', documento: '1098765432', cargo: 'Analista de datos', area: 'Finanzas', salarioBase: 4300000, fechaNacimiento: '1995-04-04', correo: 'camila.torres@alfa.test'});
  assert.equal(nuevo.status, 201);
  assert.equal((await api(token, 'POST', '/api/rrhh/empleados', {nombre: 'Otra Persona', documento: '1098765432', cargo: 'X', area: 'Y', salarioBase: 1, fechaNacimiento: '1990-01-01', correo: 'o@a.test'})).datos.error, 'DOCUMENTO_DUPLICADO');
  const evaluacion = await api(token, 'POST', `/api/rrhh/empleados/${nuevo.datos.empleado.id}/evaluaciones`, {periodo: '2026-S2', calificacion: 4.5, comentario: 'Excelente adaptación al equipo.'});
  assert.equal(evaluacion.datos.promedioDesempeno, 4.5);
  const resumen = (await api(token, 'GET', '/api/rrhh/resumen')).datos;
  assert.equal(resumen.activos, 6);
  assert.equal(resumen.nominaMensual, 9800000 + 4200000 + 3900000 + 3600000 + 2800000 + 4300000);
  const beta = (await api(await entrar('beta', 'natalia.pozo@beta.test'), 'GET', '/api/rrhh/resumen')).datos;
  assert.equal(beta.activos, 3);
});

test('la consola de trazabilidad solo muestra la actividad de la empresa autenticada y registra el JWT', async () => {
  const alfa = await admin('alfa');
  const beta = await admin('beta');
  await api(alfa, 'POST', '/api/crm/clientes', {razonSocial: 'Cliente Trazado Alfa', nit: '900765432-6', contacto: 'Contacto', correo: 'c@a.test', telefono: '+573001112222', fechaCumpleanos: '1990-02-02', ciudad: 'Cali'});
  const logsAlfa = (await api(alfa, 'GET', '/api/trazabilidad/logs')).datos.logs;
  const logsBeta = (await api(beta, 'GET', '/api/trazabilidad/logs')).datos.logs;
  const traza = logsAlfa.find((l) => l.origen === 'api_gateway' && l.mensaje.startsWith('POST /api/crm/clientes'));
  assert.ok(traza, 'la petición queda registrada');
  assert.equal(traza.payload.jwt.cid, 'alfa');
  assert.equal(traza.payload.respuesta.status, 409);
  assert.ok(!JSON.stringify(logsBeta).includes('Cliente Trazado Alfa'));
  const login = logsAlfa.find((l) => l.origen === 'auth' && l.mensaje.includes('JWT HS256 emitido'));
  assert.ok(login && !JSON.stringify(login).includes(PASSWORD));
  const desde = (await api(alfa, 'GET', '/api/trazabilidad/logs')).datos.ultimoId;
  await api(alfa, 'POST', '/api/crm/clientes/1/interacciones', {canal: 'correo', tipo: 'seguimiento', resumen: 'Se confirmó la entrega del pedido.'});
  const nuevos = (await api(alfa, 'GET', `/api/trazabilidad/logs?desde=${desde}`)).datos.logs;
  assert.ok(nuevos.length >= 1 && nuevos.every((l) => l.id > desde));
});

test('las contraseñas nunca aparecen en la consola de trazabilidad', async () => {
  const token = await entrar('alfa', 'sandra.ruiz@alfa.test');
  await api(token, 'POST', '/api/auth/cambiar-password', {actual: PASSWORD, nueva: 'SecretoNuevo2026'});
  const logs = JSON.stringify((await api(token, 'GET', '/api/trazabilidad/logs')).datos.logs);
  assert.ok(!logs.includes('SecretoNuevo2026') && !logs.includes(PASSWORD));
  assert.ok(logs.includes('[REDACTADO]'));
});
