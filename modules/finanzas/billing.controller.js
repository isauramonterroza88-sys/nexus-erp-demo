'use strict';

const {
  db, datosDe, publicar, suscribir, registrarFactura, fechaLocalISO, sumarDias, diasEntre, calcularTotales,
  generarCufe, generarQr, generarCodigoVerificacion
} = require('../../core/database');
const {ErrorHttp, invalido, v} = require('../../core/http');
const {validarItems} = require('../../core/items');
const {cop, cupoDisponible, registrarMensaje} = require('../../core/mensajeria');

const METODOS_PAGO = ['transferencia', 'efectivo', 'tarjeta', 'pse'];
const ESTADOS = ['Pendiente', 'Pagada'];

function buscarFactura(datos, id) {
  const factura = datos.facturas.find((f) => f.id === Number(id));
  if (!factura) throw new ErrorHttp(404, 'FACTURA_NO_ENCONTRADA', `No existe la factura ${id} en tu empresa`);
  return factura;
}

function vistaFactura(datos, f) {
  const cliente = datos.clientes.find((c) => c.id === f.clienteId);
  const hoy = fechaLocalISO();
  const vencida = f.estadoPago === 'Pendiente' && f.fechaVencimiento < hoy;
  return {...f, clienteNombre: cliente ? cliente.razonSocial : 'Cliente eliminado', clienteNit: cliente ? cliente.nit : null, vencida, diasVencida: vencida ? diasEntre(f.fechaVencimiento, hoy) : 0};
}

function listar(req, res) {
  const {estado} = req.query;
  if (estado !== undefined && !ESTADOS.includes(estado)) throw invalido('estado', `debe ser uno de: ${ESTADOS.join(', ')}`);
  const facturas = req.datos.facturas.filter((f) => !estado || f.estadoPago === estado).map((f) => vistaFactura(req.datos, f)).sort((a, b) => b.id - a.id);
  res.json({facturas, total: facturas.length});
}

function obtener(req, res) {
  res.json({factura: vistaFactura(req.datos, buscarFactura(req.datos, req.params.id))});
}

function documento(req, res) {
  const datos = req.datos;
  const f = buscarFactura(datos, req.params.id);
  const cliente = datos.clientes.find((c) => c.id === f.clienteId);
  res.json({
    tipo: 'Factura electrónica de venta', numero: f.numero, fechaEmision: f.fechaEmision, fechaVencimiento: f.fechaVencimiento,
    emisor: {razonSocial: datos.empresa.nombre, nit: datos.empresa.nit},
    adquiriente: cliente ? {razonSocial: cliente.razonSocial, nit: cliente.nit, correo: cliente.correo} : null,
    items: f.items, totales: {subtotal: f.subtotal, iva: f.iva, total: f.total}, cufe: f.cufe, codigoVerificacion: f.codigoVerificacion,
    urlComprobante: f.urlComprobante, codigoQr: f.qr
  });
}

async function crear(req, res) {
  const inicio = Date.now();
  const datos = req.datos;
  const cuerpo = req.body || {};
  let clienteId;
  let items;
  let cotizacion = null;
  if (cuerpo.cotizacionId !== undefined) {
    cotizacion = datos.cotizaciones.find((c) => c.id === v.entero(cuerpo.cotizacionId, 'cotizacionId', {min: 1}));
    if (!cotizacion) throw new ErrorHttp(404, 'COTIZACION_NO_ENCONTRADA', `No existe la cotización ${cuerpo.cotizacionId} en tu empresa`);
    if (cotizacion.estado !== 'aceptada') throw new ErrorHttp(409, 'COTIZACION_NO_ACEPTADA', `La cotización ${cotizacion.numero} está en estado "${cotizacion.estado}"; solo se factura una cotización aceptada`);
    if (datos.facturas.some((f) => f.cotizacionId === cotizacion.id)) throw new ErrorHttp(409, 'COTIZACION_YA_FACTURADA', `La cotización ${cotizacion.numero} ya tiene una factura`);
    clienteId = cotizacion.clienteId;
    items = validarItems(datos, cotizacion.items, {registrarPreventa: false});
  } else {
    clienteId = v.entero(cuerpo.clienteId, 'clienteId', {min: 1});
    items = validarItems(datos, cuerpo.items, {registrarPreventa: true});
  }
  const cliente = datos.clientes.find((c) => c.id === clienteId);
  if (!cliente) throw new ErrorHttp(404, 'CLIENTE_NO_ENCONTRADO', `No existe el cliente ${clienteId} en tu empresa`);
  if (cliente.estadoCuenta !== 'activo') throw new ErrorHttp(409, 'CLIENTE_INACTIVO', `El cliente ${cliente.razonSocial} está inactivo`);
  const diasCredito = v.entero(cuerpo.diasCredito === undefined ? 30 : cuerpo.diasCredito, 'diasCredito', {min: 0, max: 120});

  const id = datos.siguienteId('facturas');
  const numero = `FE-${String(id).padStart(4, '0')}`;
  const fechaEmision = fechaLocalISO();
  const totales = calcularTotales(items);
  const cufe = generarCufe({numero, fechaEmision, ...totales, nitEmisor: datos.empresa.nit, nitCliente: cliente.nit});
  const codigoVerificacion = generarCodigoVerificacion();
  const factura = {
    id, numero, cotizacionId: cotizacion ? cotizacion.id : null, clienteId, items, ...totales, estadoPago: 'Pendiente', fechaEmision, diasCredito,
    fechaVencimiento: sumarDias(fechaEmision, diasCredito), fechaPago: null, metodoPago: null, referenciaPago: null, cufe, codigoVerificacion,
    urlComprobante: `/api/verificar/${codigoVerificacion}`,
    qr: generarQr({numero, nitEmisor: datos.empresa.nit, nitCliente: cliente.nit, ...totales, cufe, codigoVerificacion}),
    vendedor: cotizacion ? cotizacion.vendedor : req.auth.usuario.nombre, emisionMs: 0, inventarioDescontado: false, despachoDigital: 'pendiente'
  };
  datos.facturas.push(factura);
  registrarFactura(datos, factura);
  datos.log('info', 'finanzas', `Factura electrónica ${numero} emitida a ${cliente.razonSocial} por ${totales.total} COP (Pendiente)`, {facturaId: id, cufe: `${cufe.slice(0, 24)}…`, codigoVerificacion, ...totales});

  const efectos = await publicar(datos, 'factura.emitida', 'Factura Emitida', {
    facturaId: id, numero, clienteId, total: totales.total, codigoVerificacion, items: items.map((i) => ({sku: i.sku, descripcion: i.descripcion, cantidad: i.cantidad}))
  }, 'finanzas');
  factura.emisionMs = Date.now() - inicio;
  res.status(201).json({factura: vistaFactura(datos, factura), efectos});
}

async function pagar(req, res) {
  const datos = req.datos;
  const factura = buscarFactura(datos, req.params.id);
  if (factura.estadoPago === 'Pagada') throw new ErrorHttp(409, 'YA_PAGADA', `La factura ${factura.numero} ya está pagada`);
  const cuerpo = req.body || {};
  const metodoPago = v.opcion(cuerpo.metodoPago, 'metodoPago', METODOS_PAGO, {defecto: 'transferencia'});
  const referencia = v.texto(cuerpo.referencia, 'referencia', {max: 60, opcional: true}) || `PAGO-${factura.numero}`;
  factura.estadoPago = 'Pagada';
  factura.fechaPago = fechaLocalISO();
  factura.metodoPago = metodoPago;
  factura.referenciaPago = referencia;
  datos.log('info', 'finanzas', `Factura ${factura.numero} marcada como Pagada (${metodoPago}, ref ${referencia})`, {facturaId: factura.id, total: factura.total, clienteId: factura.clienteId});
  const efectos = await publicar(datos, 'factura.pagada', 'Factura Pagada', {facturaId: factura.id, numero: factura.numero, clienteId: factura.clienteId, total: factura.total}, 'finanzas');
  res.json({factura: vistaFactura(datos, factura), efectos});
}

function cartera(req, res) {
  const datos = req.datos;
  const hoy = fechaLocalISO();
  const pendientes = datos.facturas.filter((f) => f.estadoPago === 'Pendiente');
  const pagadas = datos.facturas.filter((f) => f.estadoPago === 'Pagada');
  const suma = (lista) => lista.reduce((s, f) => s + f.total, 0);
  const edad = {vigente: [], d1_30: [], d31_60: [], d61_90: [], mas90: []};
  for (const f of pendientes) {
    const mora = diasEntre(f.fechaVencimiento, hoy);
    if (mora <= 0) edad.vigente.push(f);
    else if (mora <= 30) edad.d1_30.push(f);
    else if (mora <= 60) edad.d31_60.push(f);
    else if (mora <= 90) edad.d61_90.push(f);
    else edad.mas90.push(f);
  }
  const porCliente = {};
  for (const f of pendientes) {
    const cliente = datos.clientes.find((c) => c.id === f.clienteId);
    const fila = porCliente[f.clienteId] || (porCliente[f.clienteId] = {clienteId: f.clienteId, razonSocial: cliente ? cliente.razonSocial : 'Cliente eliminado', facturas: 0, total: 0, vencido: 0});
    fila.facturas += 1;
    fila.total += f.total;
    if (f.fechaVencimiento < hoy) fila.vencido += f.total;
  }
  res.json({
    moneda: datos.empresa.moneda, totalFacturado: suma(datos.facturas), totalCobrado: suma(pagadas), totalPendiente: suma(pendientes),
    totalVencido: suma(pendientes.filter((f) => f.fechaVencimiento < hoy)), facturasPendientes: pendientes.length,
    edadCartera: Object.fromEntries(Object.entries(edad).map(([k, lista]) => [k, {facturas: lista.length, total: suma(lista)}])),
    porCliente: Object.values(porCliente).sort((a, b) => b.total - a.total)
  });
}

function estadoDeCuenta(req, res) {
  const datos = req.datos;
  const cliente = datos.clientes.find((c) => c.id === Number(req.params.clienteId));
  if (!cliente) throw new ErrorHttp(404, 'CLIENTE_NO_ENCONTRADO', `No existe el cliente ${req.params.clienteId} en tu empresa`);
  const hoy = fechaLocalISO();
  const facturas = datos.facturas.filter((f) => f.clienteId === cliente.id).sort((a, b) => a.id - b.id);
  const eventos = [];
  for (const f of facturas) {
    eventos.push({fecha: f.fechaEmision, orden: 0, concepto: `Factura ${f.numero}`, cargo: f.total, abono: 0});
    if (f.estadoPago === 'Pagada') eventos.push({fecha: f.fechaPago, orden: 1, concepto: `Pago de ${f.numero} (${f.metodoPago})`, cargo: 0, abono: f.total});
  }
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
  let saldo = 0;
  const movimientos = eventos.map((e) => {
    saldo += e.cargo - e.abono;
    return {fecha: e.fecha, concepto: e.concepto, cargo: e.cargo, abono: e.abono, saldo};
  });
  const pendientes = facturas.filter((f) => f.estadoPago === 'Pendiente');
  res.json({
    cliente: {id: cliente.id, razonSocial: cliente.razonSocial, nit: cliente.nit},
    corte: hoy,
    movimientos,
    totales: {
      facturado: facturas.reduce((s, f) => s + f.total, 0),
      pagado: facturas.filter((f) => f.estadoPago === 'Pagada').reduce((s, f) => s + f.total, 0),
      saldo,
      vencido: pendientes.filter((f) => f.fechaVencimiento < hoy).reduce((s, f) => s + f.total, 0)
    }
  });
}

/* Verificación pública del comprobante (el código QR apunta aquí). Solo expone lo mínimo necesario. */
function verificarPublico(req, res) {
  const entrada = db.verificacion.get(String(req.params.codigo).toUpperCase());
  if (!entrada) return res.status(404).json({valida: false, mensaje: 'El código de verificación no corresponde a ningún comprobante emitido'});
  const datos = datosDe(entrada.empresaId);
  const f = datos.facturas.find((x) => x.id === entrada.facturaId);
  return res.json({
    valida: true, numero: f.numero, emisor: datos.empresa.nombre, nitEmisor: datos.empresa.nit, fechaEmision: f.fechaEmision, total: f.total,
    estadoPago: f.estadoPago, cufe: `${f.cufe.slice(0, 16)}…${f.cufe.slice(-8)}`
  });
}

/* Despacho del comprobante digital: usa la cuota diaria de mensajes y exige canal digital validado (R2) */
function despacharComprobante(payload, datos) {
  const factura = datos.facturas.find((f) => f.id === payload.facturaId);
  const cliente = datos.clientes.find((c) => c.id === payload.clienteId);
  if (!cliente.canalDigital) {
    factura.despachoDigital = 'sin_canal';
    return {enviado: false, motivo: 'El cliente no tiene canal digital validado: el comprobante queda disponible solo por verificación en línea'};
  }
  if (cupoDisponible(datos) === 0) {
    factura.despachoDigital = 'en_cola';
    datos.log('warn', 'canal_digital', `Cuota diaria agotada: el comprobante ${payload.numero} queda en cola para el siguiente día hábil`, null);
    return {enviado: false, motivo: 'Cuota diaria de mensajes agotada; el comprobante queda en cola'};
  }
  const mensaje = registrarMensaje(datos, {
    tipo: 'factura', cliente, plantilla: 'factura_digital', parametros: [cliente.contacto.split(' ')[0], payload.numero, cop(payload.total), payload.codigoVerificacion], referencia: payload.numero
  });
  factura.despachoDigital = 'enviado';
  return {enviado: true, mensajeId: mensaje.id};
}

function init() {
  suscribir('factura.emitida', 'finanzas', 'Despachando el comprobante digital con QR al cliente (cuota diaria de mensajes)', despacharComprobante, 200);
}

module.exports = {listar, obtener, documento, crear, pagar, cartera, estadoDeCuenta, verificarPublico, init};
