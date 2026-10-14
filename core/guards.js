'use strict';

const {verificarJwt} = require('./security');
const {db, datosDe, moduloActivo, registrarSeguridad, permisosDelRol, rolDeEmpresa} = require('./database');
const {ErrorHttp} = require('./http');

function extraerToken(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return m ? m[1].trim() : null;
}

/* Valida el JWT y fija la empresa de la petición. La empresa se toma SIEMPRE del usuario
   autenticado, nunca de parámetros enviados por el cliente. */
function autenticar(req, res, next) {
  const token = extraerToken(req);
  if (!token) {
    registrarSeguridad('warn', `Petición sin token rechazada: ${req.method} ${req.originalUrl}`, null);
    return next(new ErrorHttp(401, 'TOKEN_AUSENTE', 'Falta el encabezado Authorization: Bearer <token>'));
  }
  let payload;
  try {
    payload = verificarJwt(token).payload;
  } catch (error) {
    registrarSeguridad('warn', `Token rechazado (${error.codigo}): ${req.method} ${req.originalUrl}`, {motivo: error.message});
    return next(error);
  }
  const usuario = db.usuarios.find((u) => u.id === payload.sub);
  if (!usuario || !usuario.activo) {
    registrarSeguridad('warn', `Token de un usuario inexistente o desactivado (sub=${payload.sub})`, null);
    return next(new ErrorHttp(401, 'USUARIO_INACTIVO', 'El usuario del token no existe o fue desactivado'));
  }
  if (usuario.empresaId !== payload.cid) {
    registrarSeguridad('error', `Token inconsistente: la empresa del token (${payload.cid}) no coincide con la del usuario (${usuario.empresaId})`, null);
    return next(new ErrorHttp(401, 'TOKEN_INCONSISTENTE', 'El token no corresponde a la empresa del usuario'));
  }
  const almacen = datosDe(usuario.empresaId);
  req.auth = {payload, usuario};
  req.datos = almacen;
  req.empresa = almacen.empresa;
  return next();
}

/* Exige que el módulo esté activo en la empresa y que el rol tenga el nivel necesario */
function permiso(modulo, nivel) {
  return (req, res, next) => {
    const {usuario} = req.auth;
    const necesario = nivel || (req.method === 'GET' || req.method === 'HEAD' ? 'r' : 'w');
    if (!moduloActivo(req.datos, modulo)) {
      req.datos.log('warn', 'api_gateway', `Ruta bloqueada: el módulo ${modulo} no está activo en ${req.empresa.nombre}`, {ruta: req.originalUrl, modulo});
      return next(new ErrorHttp(403, 'MODULO_INACTIVO', `El módulo "${modulo}" no está activo en tu empresa. Un administrador puede activarlo en la Tienda de Apps.`, {modulo}));
    }
    const nivelRol = permisosDelRol(req.datos, usuario.rol)[modulo];
    if (!nivelRol) {
      req.datos.log('warn', 'api_gateway', `Acceso denegado: el rol ${usuario.rol} no tiene acceso al módulo ${modulo}`, {usuario: usuario.email, ruta: req.originalUrl});
      return next(new ErrorHttp(403, 'ROL_SIN_ACCESO', `Tu rol (${rolDeEmpresa(req.datos.empresaId, usuario.rol).nombre}) no tiene acceso a este módulo`, {modulo, rol: usuario.rol}));
    }
    if (necesario === 'w' && nivelRol !== 'rw') {
      req.datos.log('warn', 'api_gateway', `Acción denegada: el rol ${usuario.rol} solo puede leer el módulo ${modulo}`, {usuario: usuario.email, ruta: req.originalUrl});
      return next(new ErrorHttp(403, 'ROL_SOLO_LECTURA', `Tu rol (${rolDeEmpresa(req.datos.empresaId, usuario.rol).nombre}) solo tiene lectura en este módulo`, {modulo, rol: usuario.rol}));
    }
    return next();
  };
}

function soloAdmin(req, res, next) {
  if (req.auth.usuario.rol !== 'admin') {
    req.datos.log('warn', 'api_gateway', `Acción administrativa denegada al rol ${req.auth.usuario.rol}`, {usuario: req.auth.usuario.email, ruta: req.originalUrl});
    return next(new ErrorHttp(403, 'SOLO_ADMINISTRADOR', 'Esta acción es exclusiva del administrador de la empresa'));
  }
  return next();
}

/* Indica si el usuario puede leer un módulo (activo y con permiso de lectura) para componer vistas cruzadas */
function puedeLeer(req, modulo) {
  return moduloActivo(req.datos, modulo) && !!permisosDelRol(req.datos, req.auth.usuario.rol)[modulo];
}

/* ------------------------------ Trazabilidad en vivo ------------------------------ */

const RUTAS_SILENCIOSAS = new Set(['/api/trazabilidad/logs']);
const CAMPOS_SECRETOS = new Set(['password', 'actual', 'nueva', 'hash', 'token']);

function redactar(valor, profundidad = 0) {
  if (valor === null || typeof valor !== 'object' || profundidad > 4) return valor;
  if (Array.isArray(valor)) return valor.slice(0, 30).map((x) => redactar(x, profundidad + 1));
  const salida = {};
  for (const [k, v] of Object.entries(valor)) salida[k] = CAMPOS_SECRETOS.has(k) ? '[REDACTADO]' : redactar(v, profundidad + 1);
  return salida;
}

function compactar(valor) {
  if (valor === undefined) return null;
  const texto = JSON.stringify(redactar(valor));
  if (texto.length <= 1600) return JSON.parse(texto);
  return {truncado: true, bytes: texto.length, vistaPrevia: `${texto.slice(0, 1400)}…`};
}

function trazas(req, res, next) {
  const inicio = Date.now();
  let cuerpoRespuesta;
  const jsonOriginal = res.json.bind(res);
  res.json = (cuerpo) => {
    cuerpoRespuesta = cuerpo;
    return jsonOriginal(cuerpo);
  };
  res.on('finish', () => {
    const ruta = req.originalUrl.split('?')[0];
    if (req.method === 'OPTIONS' || RUTAS_SILENCIOSAS.has(ruta) || !req.datos) return;
    const mutante = req.method !== 'GET' && req.method !== 'HEAD';
    const status = res.statusCode;
    if (!(mutante || status >= 400 || req.headers['x-nexus-trace'] === '1')) return;
    const claims = req.auth ? req.auth.payload : null;
    req.datos.log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'api_gateway', `${req.method} ${ruta} -> ${status} (${Date.now() - inicio} ms)`, {
      solicitud: {consulta: Object.keys(req.query || {}).length ? req.query : undefined, cuerpo: compactar(req.body)},
      respuesta: {status, cuerpo: compactar(cuerpoRespuesta)},
      jwt: claims ? {sub: claims.sub, cid: claims.cid, rol: req.auth.usuario.rol, expiraEnSeg: claims.exp - Math.floor(Date.now() / 1000), firma: 'HS256 válida'} : null,
      empresaAislada: req.datos.empresaId
    });
  });
  next();
}

module.exports = {autenticar, permiso, soloAdmin, puedeLeer, trazas, extraerToken};
