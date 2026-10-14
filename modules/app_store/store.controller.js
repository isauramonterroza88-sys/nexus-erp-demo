'use strict';

const {CATEGORIAS, CATALOGO_MODULOS, permisosDelRol, rolDeEmpresa, moduloActivo, fechaLocalISO, sumarDias, redondear} = require('../../core/database');
const {ErrorHttp} = require('../../core/http');

const IVA = 0.19;
/* Descuento por contratar toda la suite de una vez. Se puede ajustar con NEXUS_DESCUENTO_SUITE (porcentaje, 0 a 50) */
const DESCUENTO_SUITE_PCT = Math.min(50, Math.max(0, Number(process.env.NEXUS_DESCUENTO_SUITE === undefined ? 15 : process.env.NEXUS_DESCUENTO_SUITE) || 0));

function buscarModulo(id) {
  const modulo = CATALOGO_MODULOS.find((m) => m.id === id);
  if (!modulo) throw new ErrorHttp(404, 'MODULO_NO_ENCONTRADO', `El módulo "${id}" no existe en el catálogo`);
  return modulo;
}

const dependientesActivos = (datos, id) => CATALOGO_MODULOS.filter((m) => m.dependencias.includes(id) && moduloActivo(datos, m.id));
const suscripcionActiva = (datos, id) => datos.suscripciones.find((s) => s.moduloId === id && s.estado === 'activa') || null;
const totalMensual = (datos) => datos.suscripciones.filter((s) => s.estado === 'activa').reduce((suma, s) => suma + s.precioMensual, 0);
const medioDePago = (empresa) => `${empresa.metodoPago.marca} •••• ${empresa.metodoPago.ultimos4}`;

function vistaApp(datos, modulo) {
  const categoria = CATEGORIAS.find((c) => c.id === modulo.categoria);
  return {
    id: modulo.id, nombre: modulo.nombre, categoria: modulo.categoria, categoriaNombre: categoria.nombre, icono: modulo.icono,
    descripcion: modulo.descripcion, precioMensual: modulo.precioMensual, dependencias: modulo.dependencias,
    dependientesActivos: dependientesActivos(datos, modulo.id).map((m) => m.id),
    activo: moduloActivo(datos, modulo.id), suscripcion: suscripcionActiva(datos, modulo.id)
  };
}

const precioConDescuento = (modulo, descuentoPct) => redondear(modulo.precioMensual * (1 - descuentoPct / 100));

function registrarCobro(datos, modulo, aprobado, transaccion, descuentoPct = 0) {
  const base = precioConDescuento(modulo, descuentoPct);
  const iva = redondear(base * IVA);
  const cobro = {
    id: datos.siguienteId('cobros'), moduloId: modulo.id, concepto: `Suscripción mensual: ${modulo.nombre}${descuentoPct ? ` (plan completo, ${descuentoPct} % de descuento)` : ''}`, subtotal: base, iva,
    total: redondear(base + iva), moneda: datos.empresa.moneda, estado: aprobado ? 'aprobado' : 'rechazado', transaccion,
    ts: new Date().toISOString(), medio: medioDePago(datos.empresa)
  };
  datos.cobros.push(cobro);
  return cobro;
}

const nuevaTransaccion = () => `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

function resolverActivaciones(datos, modulo, acumulado = []) {
  for (const depId of modulo.dependencias) {
    if (!moduloActivo(datos, depId) && !acumulado.some((m) => m.id === depId)) resolverActivaciones(datos, buscarModulo(depId), acumulado);
  }
  if (!acumulado.some((m) => m.id === modulo.id)) acumulado.push(modulo);
  return acumulado;
}

function listar(req, res) {
  const datos = req.datos;
  res.json({
    apps: CATALOGO_MODULOS.map((m) => vistaApp(datos, m)), categorias: CATEGORIAS, totalMensual: totalMensual(datos),
    planes: {descuentoSuitePct: DESCUENTO_SUITE_PCT},
    moneda: datos.empresa.moneda, metodoPago: medioDePago(datos.empresa), empresa: datos.empresa.nombre
  });
}

/* Calcula qué se compraría, sin cobrar ni activar nada. "suite" incluye todos los módulos que faltan; "modulos" solo los elegidos y sus dependencias. */
function armarCompra(datos, cuerpo) {
  const plan = cuerpo.plan === 'suite' ? 'suite' : 'modulos';
  let seleccion;
  if (plan === 'suite') {
    seleccion = CATALOGO_MODULOS.filter((m) => !moduloActivo(datos, m.id));
  } else {
    const ids = Array.isArray(cuerpo.moduloIds) ? cuerpo.moduloIds : [];
    if (ids.length === 0) throw new ErrorHttp(400, 'SIN_MODULOS', 'Elige al menos un módulo para contratar');
    seleccion = ids.map(buscarModulo).filter((m) => !moduloActivo(datos, m.id));
  }
  const pendientes = [];
  for (const m of seleccion) {
    for (const incluido of resolverActivaciones(datos, m)) if (!pendientes.some((x) => x.id === incluido.id)) pendientes.push(incluido);
  }
  if (pendientes.length === 0) throw new ErrorHttp(409, 'NADA_QUE_CONTRATAR', 'Los módulos elegidos ya están activos en tu empresa');
  const descuentoPct = plan === 'suite' ? DESCUENTO_SUITE_PCT : 0;
  const lineas = pendientes.map((m) => {
    const base = precioConDescuento(m, descuentoPct);
    const iva = redondear(base * IVA);
    return {moduloId: m.id, nombre: m.nombre, precioLista: m.precioMensual, subtotal: base, iva, total: redondear(base + iva), porDependencia: !seleccion.some((x) => x.id === m.id)};
  });
  const suma = (campo) => lineas.reduce((acc, l) => acc + l[campo], 0);
  return {plan, descuentoPct, pendientes, lineas, subtotal: suma('subtotal'), iva: suma('iva'), total: suma('total'), ahorro: suma('precioLista') - suma('subtotal'), moneda: datos.empresa.moneda};
}

function cotizar(req, res) {
  const compra = armarCompra(req.datos, req.body || {});
  const {pendientes, ...vista} = compra;
  res.json({compra: vista, medioPago: medioDePago(req.datos.empresa)});
}

/* Contratación con pago: solo si el cobro se aprueba se activan los módulos. Un rechazo no activa nada. */
function comprar(req, res) {
  const datos = req.datos;
  const compra = armarCompra(datos, req.body || {});
  const transaccion = nuevaTransaccion();
  if (req.body && req.body.simularRechazo === true) {
    const cobros = compra.pendientes.map((m) => registrarCobro(datos, m, false, transaccion, compra.descuentoPct));
    datos.log('error', 'app_store', `Pago rechazado por ${compra.total} ${compra.moneda}: la entidad emisora declinó la tarjeta. No se activó ningún módulo`, {transaccion, modulos: compra.pendientes.map((m) => m.id)});
    throw new ErrorHttp(402, 'PAGO_RECHAZADO', 'El pago fue rechazado por tu banco. No se activó ningún módulo ni se te cobró.', {cobros});
  }
  const cobros = [];
  for (const m of compra.pendientes) {
    cobros.push(registrarCobro(datos, m, true, transaccion, compra.descuentoPct));
    datos.suscripciones.push({id: datos.siguienteId('suscripciones'), moduloId: m.id, precioMensual: precioConDescuento(m, compra.descuentoPct), estado: 'activa', inicio: new Date().toISOString(), proximoCobro: sumarDias(fechaLocalISO(), 30), transaccion});
    datos.empresa.modulos[m.id] = true;
  }
  datos.log('info', 'app_store', `Pago aprobado ${transaccion} por ${compra.total} ${compra.moneda}. Módulos activados: ${compra.pendientes.map((m) => m.nombre).join(', ')}`, {transaccion, plan: compra.plan});
  const {pendientes, ...vista} = compra;
  res.json({compra: vista, cobros, transaccion, mensaje: `Pago aprobado. Ya puedes usar: ${compra.pendientes.map((m) => m.nombre).join(', ')}.`});
}

function activar(req, res) {
  const datos = req.datos;
  const modulo = buscarModulo(req.params.id);
  if (moduloActivo(datos, modulo.id)) return res.json({app: vistaApp(datos, modulo), activados: [], cobros: [], mensaje: `${modulo.nombre} ya estaba activo`});
  const pendientes = resolverActivaciones(datos, modulo);

  if (req.body && req.body.simularRechazo === true) {
    const cobro = registrarCobro(datos, modulo, false, nuevaTransaccion());
    datos.log('error', 'app_store', `Pago rechazado para ${modulo.nombre}: la entidad emisora declinó la tarjeta. No se activó ningún módulo`, cobro);
    throw new ErrorHttp(402, 'PAGO_RECHAZADO', `El pago de la suscripción de ${modulo.nombre} fue rechazado. Ningún módulo se activó.`, {cobro});
  }

  const cobros = [];
  for (const m of pendientes) {
    const transaccion = nuevaTransaccion();
    const cobro = registrarCobro(datos, m, true, transaccion);
    cobros.push(cobro);
    datos.suscripciones.push({id: datos.siguienteId('suscripciones'), moduloId: m.id, precioMensual: m.precioMensual, estado: 'activa', inicio: new Date().toISOString(), proximoCobro: sumarDias(fechaLocalISO(), 30), transaccion});
    datos.empresa.modulos[m.id] = true;
    const motivo = m.id === modulo.id ? 'solicitado por el administrador' : `dependencia de ${modulo.nombre}`;
    datos.log('info', 'app_store', `Módulo ${m.nombre} ACTIVADO solo para ${datos.empresa.nombre} (${motivo}). Cobro ${transaccion} por ${cobro.total} ${cobro.moneda}`, {moduloId: m.id, cobro});
  }
  res.json({app: vistaApp(datos, modulo), activados: pendientes.map((m) => m.id), cobros, mensaje: `${modulo.nombre} activado. Su menú y sus rutas ya están disponibles para tu empresa.`});
}

function desactivar(req, res) {
  const datos = req.datos;
  const modulo = buscarModulo(req.params.id);
  if (!moduloActivo(datos, modulo.id)) return res.json({app: vistaApp(datos, modulo), mensaje: `${modulo.nombre} ya estaba desactivado`});
  const dependientes = dependientesActivos(datos, modulo.id);
  if (dependientes.length) {
    throw new ErrorHttp(409, 'TIENE_DEPENDIENTES', `No se puede desactivar ${modulo.nombre}: lo necesitan ${dependientes.map((m) => m.nombre).join(', ')}. Desactívalos primero.`, {dependientes: dependientes.map((m) => m.id)});
  }
  datos.empresa.modulos[modulo.id] = false;
  for (const s of datos.suscripciones) {
    if (s.moduloId === modulo.id && s.estado === 'activa') {
      s.estado = 'cancelada';
      s.cancelada = new Date().toISOString();
    }
  }
  datos.log('warn', 'app_store', `Módulo ${modulo.nombre} DESACTIVADO en ${datos.empresa.nombre}. Sus rutas quedan bloqueadas y desaparece del menú. Los datos se conservan`, {moduloId: modulo.id});
  res.json({app: vistaApp(datos, modulo), mensaje: `${modulo.nombre} desactivado. Tus datos se conservan por si lo vuelves a activar.`});
}

/* Menú lateral: módulos activos de la empresa Y permitidos para el rol del usuario */
function menu(req, res) {
  const datos = req.datos;
  const permisos = permisosDelRol(datos, req.auth.usuario.rol);
  const visibles = (m) => moduloActivo(datos, m.id) && !!permisos[m.id];
  const categorias = CATEGORIAS.map((c) => ({
    id: c.id, nombre: c.nombre, icono: c.icono,
    apps: CATALOGO_MODULOS.filter((m) => m.categoria === c.id && visibles(m)).map((m) => ({id: m.id, nombre: m.nombre, icono: m.icono, nivel: permisos[m.id], items: m.menu}))
  })).filter((c) => c.apps.length > 0);
  res.json({
    categorias,
    activos: CATALOGO_MODULOS.filter((m) => moduloActivo(datos, m.id)).map((m) => m.id),
    visibles: CATALOGO_MODULOS.filter(visibles).map((m) => m.id),
    rol: req.auth.usuario.rol,
    inicio: rolDeEmpresa(datos.empresaId, req.auth.usuario.rol).inicio || null,
    demo: process.env.NEXUS_DEMO !== 'false',
    empresa: {id: datos.empresa.id, nombre: datos.empresa.nombre}
  });
}

function cobros(req, res) {
  res.json({cobros: req.datos.cobros.slice().reverse(), totalMensual: totalMensual(req.datos), moneda: req.datos.empresa.moneda});
}

module.exports = {listar, cotizar, comprar, activar, desactivar, menu, cobros};
