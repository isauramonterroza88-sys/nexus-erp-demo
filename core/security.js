'use strict';

const crypto = require('crypto');
const {ErrorHttp} = require('./http');

/* ---------------------------------------------------------------------------
   Los módulos los ofrece la plataforma; los cargos (roles) los define cada empresa. Una empresa nueva solo tiene el
   rol "admin" y su administrador crea los cargos que existan en su organización, con el nombre que use la empresa,
   y decide para cada módulo activo si ese cargo lo edita ('rw'), solo lo consulta ('r') o no lo ve (ausente).
   "inicio" es la pantalla a la que entra ese rol al iniciar sesión.
   ROLES_DE_EJEMPLO solo se usa para cargar las empresas de demostración; no se asigna a empresas reales.
   --------------------------------------------------------------------------- */

const ROLES_DE_EJEMPLO = {
  admin: {
    nombre: 'Administrador', descripcion: 'Acceso total, tienda de apps, usuarios y roles. No se puede editar ni eliminar.', inicio: 'panel', sistema: true,
    permisos: {ventas_crm: 'rw', finanzas: 'rw', cadena_suministro: 'rw', recursos_humanos: 'rw', marketing: 'rw', servicios: 'rw', motor_analitico: 'rw'}
  },
  ventas: {
    nombre: 'Ventas', descripcion: 'Gestiona clientes y cotizaciones. Consulta facturas y existencias.', inicio: 'crm_clientes',
    permisos: {ventas_crm: 'rw', finanzas: 'r', cadena_suministro: 'r'}
  },
  finanzas: {
    nombre: 'Finanzas', descripcion: 'Factura y gestiona la cartera. Consulta los clientes.', inicio: 'fin_facturas',
    permisos: {ventas_crm: 'r', finanzas: 'rw'}
  },
  inventario: {
    nombre: 'Logística e Inventario', descripcion: 'Controla productos y existencias. Consulta los clientes para despachar.', inicio: 'inv_productos',
    permisos: {cadena_suministro: 'rw', ventas_crm: 'r'}
  },
  rrhh: {
    nombre: 'Talento Humano', descripcion: 'Gestiona el personal y las evaluaciones.', inicio: 'rrhh_empleados',
    permisos: {recursos_humanos: 'rw'}
  },
  marketing: {
    nombre: 'Marketing', descripcion: 'Crea campañas. Consulta clientes y la segmentación.', inicio: 'mkt_campanas',
    permisos: {marketing: 'rw', ventas_crm: 'r', motor_analitico: 'r'}
  },
  soporte: {
    nombre: 'Soporte', descripcion: 'Atiende órdenes de soporte. Consulta los clientes.', inicio: 'srv_tickets',
    permisos: {servicios: 'rw', ventas_crm: 'r'}
  }
};

const copiarRoles = (origen) => Object.fromEntries(Object.entries(origen).map(([id, r]) => [id, {id, ...r, permisos: {...r.permisos}}]));

/* Una empresa nueva solo recibe el rol de administrador. Cada empresa tiene su propia copia, así editar roles nunca afecta a otra. */
const plantillaDeRoles = () => copiarRoles({admin: ROLES_DE_EJEMPLO.admin});
const rolesDeEjemplo = () => copiarRoles(ROLES_DE_EJEMPLO);

const nombresDeRoles = () => Object.keys(ROLES);

/* ---------------------------------------------------------------------------
   Contraseñas: scrypt con sal aleatoria. Formato: scrypt$N$r$p$sal$hash
   --------------------------------------------------------------------------- */

const SCRYPT = {N: 16384, r: 8, p: 1, longitud: 64};

function derivar(plano, sal, parametros, sincrono) {
  const opciones = {N: parametros.N, r: parametros.r, p: parametros.p, maxmem: 64 * 1024 * 1024};
  if (sincrono) return crypto.scryptSync(plano, sal, parametros.longitud, opciones);
  return new Promise((resolve, reject) => {
    crypto.scrypt(plano, sal, parametros.longitud, opciones, (error, clave) => (error ? reject(error) : resolve(clave)));
  });
}

function formatear(parametros, sal, clave) {
  return `scrypt$${parametros.N}$${parametros.r}$${parametros.p}$${sal.toString('base64')}$${clave.toString('base64')}`;
}

function hashPasswordSync(plano) {
  const sal = crypto.randomBytes(16);
  return formatear(SCRYPT, sal, derivar(plano, sal, SCRYPT, true));
}

async function hashPassword(plano) {
  const sal = crypto.randomBytes(16);
  return formatear(SCRYPT, sal, await derivar(plano, sal, SCRYPT, false));
}

async function verificarPassword(plano, almacenado) {
  const partes = String(almacenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const parametros = {N: Number(partes[1]), r: Number(partes[2]), p: Number(partes[3]), longitud: 64};
  const esperado = Buffer.from(partes[5], 'base64');
  const calculado = await derivar(String(plano), Buffer.from(partes[4], 'base64'), {...parametros, longitud: esperado.length}, false);
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}

function validarPolitica(password) {
  if (typeof password !== 'string') throw new ErrorHttp(422, 'PASSWORD_DEBIL', 'La contraseña es obligatoria');
  if (password.length < 8) throw new ErrorHttp(422, 'PASSWORD_DEBIL', 'La contraseña debe tener al menos 8 caracteres');
  if (password.length > 100) throw new ErrorHttp(422, 'PASSWORD_DEBIL', 'La contraseña no puede superar 100 caracteres');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new ErrorHttp(422, 'PASSWORD_DEBIL', 'La contraseña debe combinar letras y números');
  return password;
}

function generarPasswordTemporal() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bloque = (n) => Array.from(crypto.randomBytes(n), (b) => alfabeto[b % alfabeto.length]).join('');
  return `${bloque(5)}-${bloque(4)}${crypto.randomInt(10, 99)}`;
}

/* ---------------------------------------------------------------------------
   JWT HS256 implementado con crypto nativo (sin dependencias externas)
   --------------------------------------------------------------------------- */

const SECRETO_POR_DEFECTO = crypto.randomBytes(32).toString('hex');
const secretoActual = () => process.env.JWT_SECRET || SECRETO_POR_DEFECTO;
const duracionPorDefecto = () => Number(process.env.JWT_EXPIRES_SECONDS) || 8 * 3600;

const codificar = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const firmar = (cuerpo, secreto) => crypto.createHmac('sha256', secreto).update(cuerpo).digest();

function firmarJwt(claims, {duracion = duracionPorDefecto(), secreto = secretoActual()} = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const payload = {...claims, iat: ahora, exp: ahora + duracion};
  const cuerpo = `${codificar({alg: 'HS256', typ: 'JWT'})}.${codificar(payload)}`;
  return `${cuerpo}.${firmar(cuerpo, secreto).toString('base64url')}`;
}

function verificarJwt(token, {secreto = secretoActual()} = {}) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new ErrorHttp(401, 'TOKEN_MALFORMADO', 'El token no tiene el formato JWT esperado');
  let cabecera;
  let payload;
  try {
    cabecera = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch (error) {
    throw new ErrorHttp(401, 'TOKEN_MALFORMADO', 'El token no se pudo decodificar');
  }
  if (cabecera.alg !== 'HS256' || cabecera.typ !== 'JWT') throw new ErrorHttp(401, 'TOKEN_ALGORITMO', 'Algoritmo de firma no permitido');
  const esperada = firmar(`${partes[0]}.${partes[1]}`, secreto);
  const recibida = Buffer.from(partes[2], 'base64url');
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) {
    throw new ErrorHttp(401, 'TOKEN_FIRMA_INVALIDA', 'La firma del token no es válida: el token fue alterado o proviene de otro servidor');
  }
  if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new ErrorHttp(401, 'TOKEN_EXPIRADO', 'El token expiró. Inicia sesión de nuevo');
  }
  return {cabecera, payload};
}

module.exports = {
  ROLES: ROLES_DE_EJEMPLO,
  plantillaDeRoles,
  rolesDeEjemplo,
  nombresDeRoles,
  hashPassword,
  hashPasswordSync,
  verificarPassword,
  validarPolitica,
  generarPasswordTemporal,
  firmarJwt,
  verificarJwt
};
