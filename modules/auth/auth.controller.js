'use strict';

const {db, crearEmpresa, datosDe, empresaPorId, agregarUsuario, registrarSeguridad, usuariosDemo, CATALOGO_MODULOS, moduloActivo, permisosDelRol, rolDeEmpresa} = require('../../core/database');
const {hashPassword, verificarPassword, validarPolitica, generarPasswordTemporal, firmarJwt} = require('../../core/security');
const {ErrorHttp, v, invalido} = require('../../core/http');

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 5 * 60 * 1000;

const vistaUsuario = (u) => ({
  id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, rolNombre: rolDeEmpresa(u.empresaId, u.rol).nombre, empresaId: u.empresaId,
  activo: u.activo, creado: u.creado, ultimoAcceso: u.ultimoAcceso, ultimoCambioPassword: u.ultimoCambioPassword,
  debeCambiarPassword: u.debeCambiarPassword
});

const vistaEmpresa = (e) => ({id: e.id, nombre: e.nombre, nit: e.nit, moneda: e.moneda, modulos: e.modulos, creada: e.creada});

function emitirSesion(usuario, empresa) {
  const token = firmarJwt({sub: usuario.id, cid: empresa.id, rol: usuario.rol, nom: usuario.nombre});
  const [, cuerpo] = token.split('.');
  const claims = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  return {
    token,
    tipo: 'Bearer',
    expiraEn: claims.exp - claims.iat,
    claims,
    usuario: vistaUsuario(usuario),
    empresa: vistaEmpresa(empresa)
  };
}

function listarEmpresas(req, res) {
  if (process.env.NEXUS_LISTAR_EMPRESAS === 'false') return res.json({empresas: []});
  return res.json({empresas: Array.from(db.empresas.values()).map((e) => ({id: e.id, nombre: e.nombre}))});
}

function credencialesDemo(req, res) {
  if (process.env.NEXUS_DEMO === 'false') throw new ErrorHttp(404, 'NO_DISPONIBLE', 'Las credenciales de demostración están deshabilitadas');
  return res.json({
    aviso: 'Credenciales de la prueba piloto. Deshabilítalas con NEXUS_DEMO=false en producción.',
    usuarios: usuariosDemo
  });
}

async function registro(req, res) {
  const cuerpo = req.body || {};
  const empresaDatos = cuerpo.empresa || {};
  const adminDatos = cuerpo.admin || {};
  const nombreEmpresa = v.texto(empresaDatos.nombre, 'empresa.nombre', {min: 3, max: 80});
  const nit = v.nit(empresaDatos.nit, 'empresa.nit');
  const nombreAdmin = v.texto(adminDatos.nombre, 'admin.nombre', {min: 3, max: 80});
  const correo = v.email(adminDatos.email, 'admin.email');
  validarPolitica(adminDatos.password);
  const existente = Array.from(db.empresas.values()).find((e) => e.nit === nit);
  if (existente) throw new ErrorHttp(409, 'EMPRESA_DUPLICADA', `Ya existe una empresa registrada con el NIT ${nit}`);
  const hash = await hashPassword(adminDatos.password);
  const empresa = crearEmpresa({nombre: nombreEmpresa, nit});
  const usuario = agregarUsuario({empresaId: empresa.id, nombre: nombreAdmin, email: correo, rol: 'admin', hash});
  const almacen = datosDe(empresa.id);
  req.datos = almacen;
  almacen.log('info', 'auth', `Empresa registrada: ${empresa.nombre} (${empresa.id}). Entorno aislado y vacío creado`, {empresaId: empresa.id, modulosActivos: ['ventas_crm']});
  registrarSeguridad('info', `Nueva empresa registrada: ${empresa.id}`, {nit});
  usuario.ultimoAcceso = new Date().toISOString();
  res.status(201).json(emitirSesion(usuario, empresa));
}

async function login(req, res) {
  const cuerpo = req.body || {};
  const empresaId = v.texto(cuerpo.empresaId, 'empresaId', {max: 60});
  const correo = v.texto(cuerpo.email, 'email', {max: 120}).toLowerCase();
  const password = v.texto(cuerpo.password, 'password', {max: 100});
  const empresa = empresaPorId(empresaId);
  const credencialesInvalidas = new ErrorHttp(401, 'CREDENCIALES_INVALIDAS', 'Empresa, correo o contraseña incorrectos');
  if (!empresa) {
    registrarSeguridad('warn', `Intento de acceso a una empresa inexistente: ${empresaId}`, null);
    throw credencialesInvalidas;
  }
  const almacen = datosDe(empresa.id);
  req.datos = almacen;
  const usuario = db.usuarios.find((u) => u.empresaId === empresa.id && u.email === correo);
  if (!usuario) {
    almacen.log('warn', 'auth', `Intento de acceso con un correo desconocido: ${correo}`, null);
    throw credencialesInvalidas;
  }
  if (usuario.bloqueadoHasta && new Date(usuario.bloqueadoHasta).getTime() > Date.now()) {
    almacen.log('warn', 'auth', `Cuenta bloqueada temporalmente: ${usuario.email}`, {bloqueadoHasta: usuario.bloqueadoHasta});
    throw new ErrorHttp(429, 'CUENTA_BLOQUEADA', 'Demasiados intentos fallidos. La cuenta está bloqueada por 5 minutos.', {bloqueadoHasta: usuario.bloqueadoHasta});
  }
  if (!usuario.activo) {
    almacen.log('warn', 'auth', `Intento de acceso de un usuario desactivado: ${usuario.email}`, null);
    throw credencialesInvalidas;
  }
  const correcta = await verificarPassword(password, usuario.hash);
  if (!correcta) {
    usuario.intentosFallidos += 1;
    if (usuario.intentosFallidos >= MAX_INTENTOS) {
      usuario.bloqueadoHasta = new Date(Date.now() + BLOQUEO_MS).toISOString();
      usuario.intentosFallidos = 0;
      almacen.log('error', 'auth', `Cuenta ${usuario.email} bloqueada por ${MAX_INTENTOS} intentos fallidos`, {bloqueadoHasta: usuario.bloqueadoHasta});
    } else {
      almacen.log('warn', 'auth', `Contraseña incorrecta para ${usuario.email} (intento ${usuario.intentosFallidos} de ${MAX_INTENTOS})`, null);
    }
    throw credencialesInvalidas;
  }
  usuario.intentosFallidos = 0;
  usuario.bloqueadoHasta = null;
  usuario.ultimoAcceso = new Date().toISOString();
  const sesion = emitirSesion(usuario, empresa);
  almacen.log('info', 'auth', `Inicio de sesión de ${usuario.email} (${usuario.rol}). JWT HS256 emitido; contraseña verificada con scrypt`, {claims: sesion.claims, empresaAislada: empresa.id});
  res.json(sesion);
}

function yo(req, res) {
  const {usuario, payload} = req.auth;
  res.json({
    usuario: vistaUsuario(usuario),
    empresa: vistaEmpresa(req.empresa),
    permisos: permisosDelRol(req.datos, usuario.rol),
    claims: payload,
    expiraEnSeg: payload.exp - Math.floor(Date.now() / 1000)
  });
}

function logout(req, res) {
  req.datos.log('info', 'auth', `Cierre de sesión de ${req.auth.usuario.email}. El cliente descarta el JWT`, null);
  res.json({mensaje: 'Sesión cerrada'});
}

async function cambiarPassword(req, res) {
  const usuario = req.auth.usuario;
  const cuerpo = req.body || {};
  const actual = v.texto(cuerpo.actual, 'actual', {max: 100});
  const nueva = validarPolitica(cuerpo.nueva);
  if (!(await verificarPassword(actual, usuario.hash))) throw new ErrorHttp(403, 'PASSWORD_ACTUAL_INCORRECTA', 'La contraseña actual no es correcta');
  if (actual === nueva) throw new ErrorHttp(422, 'PASSWORD_REPETIDA', 'La nueva contraseña debe ser distinta de la actual');
  usuario.hash = await hashPassword(nueva);
  usuario.debeCambiarPassword = false;
  usuario.ultimoCambioPassword = new Date().toISOString();
  req.datos.log('info', 'auth', `${usuario.email} actualizó su contraseña. Nuevo hash scrypt almacenado`, null);
  res.json({mensaje: 'Contraseña actualizada', usuario: vistaUsuario(usuario)});
}

/* ------------------------------ Roles de la empresa (editables por su administrador) ------------------------------ */

const idsDeRoles = (datos) => Object.keys(datos.roles);

function vistaRol(datos, rol) {
  return {
    id: rol.id, nombre: rol.nombre, descripcion: rol.descripcion || '', inicio: rol.inicio || null, sistema: !!rol.sistema,
    permisos: permisosDelRol(datos, rol.id), usuarios: db.usuarios.filter((u) => u.empresaId === datos.empresaId && u.rol === rol.id).length
  };
}

function roles(req, res) {
  res.json({
    roles: Object.values(req.datos.roles).map((r) => vistaRol(req.datos, r)),
    modulos: CATALOGO_MODULOS.map((m) => ({id: m.id, nombre: m.nombre, activo: moduloActivo(req.datos, m.id), pantallas: m.menu.map((i) => ({id: i.id, label: i.label}))}))
  });
}

function validarPermisos(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw invalido('permisos', 'debe ser un objeto con un nivel por módulo');
  const permisos = {};
  for (const [modulo, nivel] of Object.entries(entrada)) {
    if (!CATALOGO_MODULOS.some((m) => m.id === modulo)) throw invalido('permisos', `el módulo "${modulo}" no existe`);
    if (nivel === null || nivel === '' || nivel === false) continue;
    if (nivel !== 'r' && nivel !== 'rw') throw invalido('permisos', `el nivel de ${modulo} debe ser "r" (solo lectura) o "rw" (lectura y escritura)`);
    permisos[modulo] = nivel;
  }
  return permisos;
}

/* La pantalla de inicio debe pertenecer a un módulo al que el rol tiene acceso */
function validarInicio(valor, permisos) {
  if (valor === undefined || valor === null || valor === '') return null;
  const permitidas = CATALOGO_MODULOS.filter((m) => permisos[m.id]).flatMap((m) => m.menu.map((i) => i.id));
  if (!permitidas.includes(valor)) throw invalido('inicio', 'la pantalla de inicio debe ser de un módulo al que el rol tiene acceso');
  return valor;
}

const idDeRol = (nombre) => nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

function crearRol(req, res) {
  const cuerpo = req.body || {};
  const nombre = v.texto(cuerpo.nombre, 'nombre', {min: 3, max: 40});
  const descripcion = cuerpo.descripcion === undefined ? '' : v.texto(cuerpo.descripcion, 'descripcion', {min: 0, max: 200});
  const permisos = validarPermisos(cuerpo.permisos === undefined ? {} : cuerpo.permisos);
  const id = idDeRol(nombre);
  if (!id) throw invalido('nombre', 'no genera un identificador válido');
  if (id === 'admin' || req.datos.roles[id] || Object.values(req.datos.roles).some((r) => r.nombre.toLowerCase() === nombre.toLowerCase())) {
    throw new ErrorHttp(409, 'ROL_DUPLICADO', `Ya existe un rol llamado "${nombre}" en tu empresa`);
  }
  const rol = {id, nombre, descripcion, permisos, inicio: validarInicio(cuerpo.inicio, permisos)};
  req.datos.roles[id] = rol;
  req.datos.log('info', 'auth', `Rol creado: ${nombre}`, rol);
  res.status(201).json({rol: vistaRol(req.datos, rol)});
}

function buscarRol(req) {
  const rol = req.datos.roles[req.params.id];
  if (!rol) throw new ErrorHttp(404, 'ROL_NO_ENCONTRADO', `No existe el rol "${req.params.id}" en tu empresa`);
  if (rol.sistema) throw new ErrorHttp(409, 'ROL_DE_SISTEMA', 'El rol de administrador no se puede editar ni eliminar: garantiza que siempre haya quien administre la empresa');
  return rol;
}

function actualizarRol(req, res) {
  const rol = buscarRol(req);
  const cuerpo = req.body || {};
  const siguiente = {...rol, permisos: {...rol.permisos}};
  if (cuerpo.nombre !== undefined) {
    siguiente.nombre = v.texto(cuerpo.nombre, 'nombre', {min: 3, max: 40});
    if (Object.values(req.datos.roles).some((r) => r.id !== rol.id && r.nombre.toLowerCase() === siguiente.nombre.toLowerCase())) throw new ErrorHttp(409, 'ROL_DUPLICADO', `Ya existe un rol llamado "${siguiente.nombre}" en tu empresa`);
  }
  if (cuerpo.descripcion !== undefined) siguiente.descripcion = v.texto(cuerpo.descripcion, 'descripcion', {min: 0, max: 200});
  if (cuerpo.permisos !== undefined) siguiente.permisos = validarPermisos(cuerpo.permisos);
  siguiente.inicio = validarInicio(cuerpo.inicio === undefined ? rol.inicio : cuerpo.inicio, siguiente.permisos);
  req.datos.roles[rol.id] = siguiente;
  req.datos.log('info', 'auth', `Rol actualizado: ${siguiente.nombre}. Los cambios aplican desde la siguiente petición de cada usuario con ese rol`, siguiente);
  res.json({rol: vistaRol(req.datos, siguiente)});
}

function eliminarRol(req, res) {
  const rol = buscarRol(req);
  const enUso = db.usuarios.filter((u) => u.empresaId === req.empresa.id && u.rol === rol.id).length;
  if (enUso > 0) throw new ErrorHttp(409, 'ROL_EN_USO', `No se puede eliminar "${rol.nombre}": lo tienen ${enUso} usuario(s). Cámbiales el rol primero.`);
  delete req.datos.roles[rol.id];
  req.datos.log('warn', 'auth', `Rol eliminado: ${rol.nombre}`, {id: rol.id});
  res.json({mensaje: `Rol "${rol.nombre}" eliminado`});
}

/* ------------------------------ Administración de usuarios (solo admin) ------------------------------ */

const usuariosDeEmpresa = (empresaId) => db.usuarios.filter((u) => u.empresaId === empresaId);

function buscarUsuarioDeEmpresa(req) {
  const usuario = usuariosDeEmpresa(req.empresa.id).find((u) => u.id === Number(req.params.id));
  if (!usuario) throw new ErrorHttp(404, 'USUARIO_NO_ENCONTRADO', `No existe el usuario ${req.params.id} en tu empresa`);
  return usuario;
}

function listarUsuarios(req, res) {
  res.json({usuarios: usuariosDeEmpresa(req.empresa.id).map(vistaUsuario)});
}

async function crearUsuario(req, res) {
  const cuerpo = req.body || {};
  const nombre = v.texto(cuerpo.nombre, 'nombre', {min: 3, max: 80});
  const correo = v.email(cuerpo.email, 'email');
  const rol = v.opcion(cuerpo.rol, 'rol', idsDeRoles(req.datos));
  if (usuariosDeEmpresa(req.empresa.id).some((u) => u.email === correo)) throw new ErrorHttp(409, 'EMAIL_DUPLICADO', `Ya existe un usuario con el correo ${correo} en tu empresa`);
  const temporal = cuerpo.password === undefined;
  const password = temporal ? generarPasswordTemporal() : validarPolitica(cuerpo.password);
  const usuario = agregarUsuario({empresaId: req.empresa.id, nombre, email: correo, rol, hash: await hashPassword(password)});
  usuario.debeCambiarPassword = temporal;
  req.datos.log('info', 'auth', `Usuario creado: ${correo} con rol ${rol}${temporal ? ' (contraseña temporal generada)' : ''}`, vistaUsuario(usuario));
  res.status(201).json({usuario: vistaUsuario(usuario), passwordTemporal: temporal ? password : undefined});
}

function actualizarUsuario(req, res) {
  const usuario = buscarUsuarioDeEmpresa(req);
  const cuerpo = req.body || {};
  const cambios = {};
  if (cuerpo.nombre !== undefined) cambios.nombre = v.texto(cuerpo.nombre, 'nombre', {min: 3, max: 80});
  if (cuerpo.rol !== undefined) cambios.rol = v.opcion(cuerpo.rol, 'rol', idsDeRoles(req.datos));
  if (cuerpo.activo !== undefined) cambios.activo = v.booleano(cuerpo.activo, 'activo');
  const esElMismo = usuario.id === req.auth.usuario.id;
  if (esElMismo && (cambios.activo === false || (cambios.rol && cambios.rol !== 'admin'))) {
    throw new ErrorHttp(409, 'AUTOEXCLUSION', 'No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
  }
  const eraAdminActivo = usuario.rol === 'admin' && usuario.activo;
  const dejaraDeSerlo = cambios.activo === false || (cambios.rol && cambios.rol !== 'admin');
  if (eraAdminActivo && dejaraDeSerlo) {
    const otros = usuariosDeEmpresa(req.empresa.id).filter((u) => u.id !== usuario.id && u.rol === 'admin' && u.activo);
    if (otros.length === 0) throw new ErrorHttp(409, 'ULTIMO_ADMIN', 'La empresa debe conservar al menos un administrador activo');
  }
  Object.assign(usuario, cambios);
  req.datos.log('info', 'auth', `Usuario actualizado: ${usuario.email}`, cambios);
  res.json({usuario: vistaUsuario(usuario)});
}

async function restablecer(req, res) {
  const usuario = buscarUsuarioDeEmpresa(req);
  const temporal = generarPasswordTemporal();
  usuario.hash = await hashPassword(temporal);
  usuario.debeCambiarPassword = true;
  usuario.intentosFallidos = 0;
  usuario.bloqueadoHasta = null;
  usuario.ultimoCambioPassword = new Date().toISOString();
  req.datos.log('warn', 'auth', `Contraseña de ${usuario.email} restablecida por el administrador. Se generó una clave temporal`, null);
  res.json({usuario: vistaUsuario(usuario), passwordTemporal: temporal});
}

module.exports = {listarEmpresas, credencialesDemo, registro, login, yo, logout, cambiarPassword, roles, crearRol, actualizarRol, eliminarRol, listarUsuarios, crearUsuario, actualizarUsuario, restablecer};
