'use strict';

class ErrorHttp extends Error {
  constructor(status, codigo, mensaje, detalle) {
    super(mensaje);
    this.name = 'ErrorHttp';
    this.status = status;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

const invalido = (campo, razon) => new ErrorHttp(422, 'VALIDACION', `${campo}: ${razon}`, {campo});

function texto(valor, campo, {min = 1, max = 200, opcional = false} = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (opcional) return undefined;
    throw invalido(campo, 'es obligatorio');
  }
  if (typeof valor !== 'string') throw invalido(campo, 'debe ser texto');
  const limpio = valor.trim();
  if (limpio.length < min) throw invalido(campo, `debe tener al menos ${min} caracteres`);
  if (limpio.length > max) throw invalido(campo, `no puede superar ${max} caracteres`);
  return limpio;
}

function entero(valor, campo, {min = 0, max = Number.MAX_SAFE_INTEGER, opcional = false} = {}) {
  if (valor === undefined || valor === null) {
    if (opcional) return undefined;
    throw invalido(campo, 'es obligatorio');
  }
  if (!Number.isInteger(valor)) throw invalido(campo, 'debe ser un número entero');
  if (valor < min || valor > max) throw invalido(campo, `debe estar entre ${min} y ${max}`);
  return valor;
}

function numero(valor, campo, {min = 0, max = 1e12, opcional = false} = {}) {
  if (valor === undefined || valor === null) {
    if (opcional) return undefined;
    throw invalido(campo, 'es obligatorio');
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw invalido(campo, 'debe ser un número');
  if (valor < min || valor > max) throw invalido(campo, `debe estar entre ${min} y ${max}`);
  return valor;
}

function booleano(valor, campo, {opcional = false, defecto} = {}) {
  if (valor === undefined || valor === null) {
    if (defecto !== undefined) return defecto;
    if (opcional) return undefined;
    throw invalido(campo, 'es obligatorio');
  }
  if (typeof valor !== 'boolean') throw invalido(campo, 'debe ser verdadero o falso');
  return valor;
}

function fecha(valor, campo, {opcional = false, noFutura = false} = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (opcional) return undefined;
    throw invalido(campo, 'es obligatorio');
  }
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw invalido(campo, 'debe tener formato AAAA-MM-DD');
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) throw invalido(campo, 'no es una fecha válida');
  if (noFutura && valor > new Date().toISOString().slice(0, 10)) throw invalido(campo, 'no puede estar en el futuro');
  return valor;
}

function email(valor, campo) {
  const v = texto(valor, campo, {max: 120});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw invalido(campo, 'no es un correo válido');
  return v.toLowerCase();
}

function telefono(valor, campo) {
  const v = texto(valor, campo, {max: 20});
  if (!/^\+[1-9]\d{7,14}$/.test(v)) throw invalido(campo, 'debe estar en formato internacional, por ejemplo +573001234567');
  return v;
}

function opcion(valor, campo, lista, {opcional = false, defecto} = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (defecto !== undefined) return defecto;
    if (opcional) return undefined;
    throw invalido(campo, 'es obligatorio');
  }
  if (!lista.includes(valor)) throw invalido(campo, `debe ser uno de: ${lista.join(', ')}`);
  return valor;
}

function listaDeOpciones(valor, campo, permitidas) {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) throw invalido(campo, 'debe ser una lista');
  for (const x of valor) if (!permitidas.includes(x)) throw invalido(campo, `contiene un valor no permitido: ${x}`);
  return Array.from(new Set(valor));
}

function digitoVerificacionNit(base) {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const suma = String(base).split('').reverse().reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = suma % 11;
  return resto > 1 ? 11 - resto : resto;
}

function nit(valor, campo = 'nit') {
  const limpio = texto(valor, campo, {max: 20}).replace(/[.\s]/g, '');
  const m = /^(\d{6,10})(?:-?(\d))?$/.exec(limpio);
  if (!m) throw invalido(campo, 'debe tener entre 6 y 10 dígitos y, opcionalmente, el dígito de verificación. Ejemplo: 900123456-8');
  const dv = digitoVerificacionNit(m[1]);
  if (m[2] !== undefined && Number(m[2]) !== dv) throw invalido(campo, `el dígito de verificación correcto para ${m[1]} es ${dv}`);
  return `${m[1]}-${dv}`;
}

module.exports = {
  ErrorHttp,
  asyncHandler,
  invalido,
  digitoVerificacionNit,
  v: {texto, entero, numero, booleano, fecha, email, telefono, opcion, listaDeOpciones, nit}
};
