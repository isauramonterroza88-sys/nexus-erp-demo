'use strict';

const {suscribir} = require('../../core/database');
const {ErrorHttp, v} = require('../../core/http');

const estadoStock = (p) => (p.stock <= 0 ? 'agotado' : p.stock <= p.stockMinimo ? 'bajo' : 'ok');
const vistaProducto = (p) => ({...p, estadoStock: estadoStock(p), valorInventario: p.stock * p.precioUnitario});

function buscarProducto(datos, id) {
  const producto = datos.productos.find((p) => p.id === Number(id));
  if (!producto) throw new ErrorHttp(404, 'PRODUCTO_NO_ENCONTRADO', `No existe el producto ${id} en tu empresa`);
  return producto;
}

function registrarMovimiento(datos, {producto, tipo, cantidad, saldoAnterior, referencia, origen}) {
  const movimiento = {
    id: datos.siguienteId('movimientos'), ts: new Date().toISOString(), tipo, productoId: producto.id, sku: producto.sku, producto: producto.nombre,
    cantidad, saldoAnterior, saldo: producto.stock, referencia: referencia || null, origen
  };
  datos.movimientos.push(movimiento);
  return movimiento;
}

function listar(req, res) {
  const datos = req.datos;
  const soloAlertas = req.query.alertas === 'true';
  const productos = datos.productos.map(vistaProducto).filter((p) => !soloAlertas || p.estadoStock !== 'ok');
  res.json({
    productos, total: productos.length,
    resumen: {
      unidades: datos.productos.reduce((s, p) => s + p.stock, 0),
      valorInventario: datos.productos.reduce((s, p) => s + p.stock * p.precioUnitario, 0),
      enAlerta: datos.productos.filter((p) => estadoStock(p) !== 'ok').length
    }
  });
}

function crear(req, res) {
  const datos = req.datos;
  const cuerpo = req.body || {};
  const sku = v.texto(cuerpo.sku, 'sku', {min: 3, max: 30}).toUpperCase();
  if (datos.productos.some((p) => p.sku === sku)) throw new ErrorHttp(409, 'SKU_DUPLICADO', `Ya existe un producto con el SKU ${sku} en tu empresa`);
  const stock = v.entero(cuerpo.stock === undefined ? 0 : cuerpo.stock, 'stock', {min: 0, max: 1000000});
  const producto = {
    id: datos.siguienteId('productos'), sku, nombre: v.texto(cuerpo.nombre, 'nombre', {min: 3, max: 120}),
    categoria: v.texto(cuerpo.categoria, 'categoria', {max: 60, opcional: true}) || 'General',
    precioUnitario: v.numero(cuerpo.precioUnitario, 'precioUnitario', {min: 0}),
    ivaPct: v.numero(cuerpo.ivaPct === undefined ? 19 : cuerpo.ivaPct, 'ivaPct', {min: 0, max: 100}),
    stock, stockMinimo: v.entero(cuerpo.stockMinimo === undefined ? 0 : cuerpo.stockMinimo, 'stockMinimo', {min: 0, max: 1000000}),
    unidad: v.texto(cuerpo.unidad, 'unidad', {max: 20, opcional: true}) || 'unidad'
  };
  datos.productos.push(producto);
  if (stock > 0) registrarMovimiento(datos, {producto, tipo: 'entrada', cantidad: stock, saldoAnterior: 0, referencia: 'Saldo inicial', origen: 'manual'});
  datos.log('info', 'cadena_suministro', `Producto creado: ${producto.sku} ${producto.nombre} con ${stock} unidades`, producto);
  res.status(201).json({producto: vistaProducto(producto)});
}

function actualizar(req, res) {
  const datos = req.datos;
  const producto = buscarProducto(datos, req.params.id);
  const cuerpo = req.body || {};
  const cambios = {};
  if (cuerpo.nombre !== undefined) cambios.nombre = v.texto(cuerpo.nombre, 'nombre', {min: 3, max: 120});
  if (cuerpo.categoria !== undefined) cambios.categoria = v.texto(cuerpo.categoria, 'categoria', {max: 60});
  if (cuerpo.precioUnitario !== undefined) cambios.precioUnitario = v.numero(cuerpo.precioUnitario, 'precioUnitario', {min: 0});
  if (cuerpo.ivaPct !== undefined) cambios.ivaPct = v.numero(cuerpo.ivaPct, 'ivaPct', {min: 0, max: 100});
  if (cuerpo.stockMinimo !== undefined) cambios.stockMinimo = v.entero(cuerpo.stockMinimo, 'stockMinimo', {min: 0, max: 1000000});
  Object.assign(producto, cambios);
  datos.log('info', 'cadena_suministro', `Producto actualizado: ${producto.sku}`, cambios);
  res.json({producto: vistaProducto(producto)});
}

function entrada(req, res) {
  const datos = req.datos;
  const producto = buscarProducto(datos, req.params.id);
  const cuerpo = req.body || {};
  const cantidad = v.entero(cuerpo.cantidad, 'cantidad', {min: 1, max: 1000000});
  const referencia = v.texto(cuerpo.referencia, 'referencia', {max: 80, opcional: true}) || 'Reabastecimiento';
  const saldoAnterior = producto.stock;
  producto.stock += cantidad;
  const movimiento = registrarMovimiento(datos, {producto, tipo: 'entrada', cantidad, saldoAnterior, referencia, origen: 'manual'});
  datos.log('info', 'cadena_suministro', `Entrada de mercancía ${producto.sku}: ${saldoAnterior} -> ${producto.stock} (+${cantidad})`, movimiento);
  res.status(201).json({producto: vistaProducto(producto), movimiento});
}

function movimientos(req, res) {
  const limite = v.entero(req.query.limite === undefined ? 100 : Number(req.query.limite), 'limite', {min: 1, max: 500});
  const sku = req.query.sku;
  const lista = req.datos.movimientos.filter((m) => !sku || m.sku === sku).slice().reverse().slice(0, limite);
  res.json({movimientos: lista, total: lista.length});
}

function alertas(req, res) {
  const lista = req.datos.productos.map(vistaProducto).filter((p) => p.estadoStock !== 'ok');
  res.json({alertas: lista, total: lista.length});
}

/* Reacción al evento que publica Finanzas cuando se emite una factura: descuenta el stock en tiempo real */
function descontarPorFactura(payload, datos) {
  const factura = datos.facturas.find((f) => f.id === payload.facturaId);
  if (factura && factura.inventarioDescontado) {
    datos.log('warn', 'cadena_suministro', `Factura ${payload.numero}: el stock ya fue descontado antes. No se repite el movimiento`, {facturaId: payload.facturaId});
    return {movimientos: 0, detalle: [], faltantes: [], nota: 'Stock ya descontado'};
  }
  const detalle = [];
  const faltantes = [];
  for (const item of payload.items) {
    if (!item.sku) continue;
    const producto = datos.productos.find((p) => p.sku === item.sku);
    if (!producto) {
      faltantes.push({sku: item.sku, motivo: 'El SKU no existe en el inventario'});
      datos.log('error', 'cadena_suministro', `Factura ${payload.numero}: el SKU ${item.sku} no existe en el inventario`, item);
      continue;
    }
    if (producto.stock < item.cantidad) {
      faltantes.push({sku: item.sku, motivo: 'Stock insuficiente', disponible: producto.stock, solicitado: item.cantidad});
      datos.log('error', 'cadena_suministro', `Factura ${payload.numero}: stock insuficiente de ${producto.sku} (hay ${producto.stock}, se necesitan ${item.cantidad})`, item);
      continue;
    }
    const saldoAnterior = producto.stock;
    producto.stock -= item.cantidad;
    const movimiento = registrarMovimiento(datos, {producto, tipo: 'salida', cantidad: item.cantidad, saldoAnterior, referencia: payload.numero, origen: `finanzas:${payload.numero}`});
    detalle.push({sku: producto.sku, cantidad: item.cantidad, saldo: producto.stock});
    datos.log('info', 'cadena_suministro', `Stock actualizado ${producto.sku}: ${saldoAnterior} -> ${producto.stock} (-${item.cantidad}) por la factura ${payload.numero}`, movimiento);
    if (estadoStock(producto) !== 'ok') {
      datos.log('warn', 'cadena_suministro', `Alerta de reposición: ${producto.sku} quedó en ${producto.stock} unidades (mínimo ${producto.stockMinimo})`, {sku: producto.sku, stock: producto.stock, stockMinimo: producto.stockMinimo});
    }
  }
  if (factura) {
    factura.inventarioDescontado = true;
    factura.inventarioFaltantes = faltantes.length ? faltantes : null;
  }
  return {movimientos: detalle.length, detalle, faltantes};
}

function init() {
  suscribir('factura.emitida', 'cadena_suministro', 'Disparando reducción de stock en módulo Inventario', descontarPorFactura, 100);
}

module.exports = {listar, crear, actualizar, entrada, movimientos, alertas, init};
