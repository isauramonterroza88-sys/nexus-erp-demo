'use strict';

const {fechaLocalISO, diasEntre, sumarDias, calcularTotales, moduloActivo} = require('../../core/database');
const {ErrorHttp, invalido, v} = require('../../core/http');
const {puedeLeer} = require('../../core/guards');
const {validarItems} = require('../../core/items');
const analitica = require('../motor_analitico/analytics.service');

const ETAPAS = [
  {id: 'nuevo', nombre: 'Nuevo', probabilidad: 10},
  {id: 'calificado', nombre: 'Calificado', probabilidad: 30},
  {id: 'propuesta', nombre: 'Propuesta', probabilidad: 55},
  {id: 'negociacion', nombre: 'Negociación', probabilidad: 75},
  {id: 'ganado', nombre: 'Cerrada ganada', probabilidad: 100},
  {id: 'perdido', nombre: 'Cerrada perdida', probabilidad: 0}
];
const TIPOLOGIAS = ['tienda_tradicional', 'minimercado', 'autoservicio', 'institucional'];
const ZONAS = ['urbana', 'cabecera', 'rural'];
const CANALES = ['whatsapp', 'correo', 'telefono', 'visita', 'presencial'];
const TIPOS_INTERACCION = ['llamada', 'reunion', 'cotizacion', 'pedido', 'seguimiento', 'posventa'];

/* ------------------------------ Cumpleaños (fidelización) ------------------------------ */

const esBisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const mesDia = (fechaISO, anio) => {
  const md = fechaISO.slice(5, 10);
  return md === '02-29' && !esBisiesto(anio) ? '02-28' : md;
};

function proximoCumple(cliente, desdeISO) {
  const anio = Number(desdeISO.slice(0, 4));
  for (const a of [anio, anio + 1]) {
    const fecha = `${a}-${mesDia(cliente.fechaCumpleanos, a)}`;
    const dias = diasEntre(desdeISO, fecha);
    if (dias >= 0) return {fecha, dias};
  }
  return null;
}

function proximosCumpleanos(datos, dias, desdeISO = fechaLocalISO()) {
  return datos.clientes.filter((c) => c.estadoCuenta === 'activo').map((c) => {
    const proximo = proximoCumple(c, desdeISO);
    return {clienteId: c.id, razonSocial: c.razonSocial, contacto: c.contacto, fechaCumpleanos: c.fechaCumpleanos, proximaFecha: proximo.fecha, diasRestantes: proximo.dias, cumpleAnios: Number(proximo.fecha.slice(0, 4)) - Number(c.fechaCumpleanos.slice(0, 4))};
  }).filter((c) => c.diasRestantes <= dias).sort((x, y) => x.diasRestantes - y.diasRestantes);
}

/* ------------------------------ Validaciones ------------------------------ */

const CAMPOS_CLIENTE = {
  razonSocial: (x) => v.texto(x, 'razonSocial', {min: 2, max: 120}),
  nombreComercial: (x) => v.texto(x, 'nombreComercial', {max: 120, opcional: true}),
  nit: (x) => v.nit(x, 'nit'),
  contacto: (x) => v.texto(x, 'contacto', {min: 2, max: 80}),
  cargo: (x) => v.texto(x, 'cargo', {max: 80, opcional: true}),
  correo: (x) => v.email(x, 'correo'),
  telefono: (x) => v.telefono(x, 'telefono'),
  direccion: (x) => v.texto(x, 'direccion', {max: 160, opcional: true}),
  fechaCumpleanos: (x) => v.fecha(x, 'fechaCumpleanos', {noFutura: true}),
  ciudad: (x) => v.texto(x, 'ciudad', {max: 60}),
  tipologia: (x) => v.opcion(x, 'tipologia', TIPOLOGIAS, {defecto: 'tienda_tradicional'}),
  zona: (x) => v.opcion(x, 'zona', ZONAS, {defecto: 'urbana'}),
  canalDigital: (x) => v.booleano(x, 'canalDigital', {defecto: true}),
  estadoCuenta: (x) => v.opcion(x, 'estadoCuenta', ['activo', 'inactivo'], {defecto: 'activo'})
};

function validarCliente(cuerpo, parcial = false) {
  const fuente = cuerpo || {};
  const salida = {};
  for (const [campo, validar] of Object.entries(CAMPOS_CLIENTE)) {
    if (parcial && fuente[campo] === undefined) continue;
    const valor = validar(fuente[campo]);
    if (valor !== undefined) salida[campo] = valor;
  }
  return salida;
}

function buscar(coleccion, id, codigo, etiqueta) {
  const registro = coleccion.find((x) => x.id === Number(id));
  if (!registro) throw new ErrorHttp(404, codigo, `No existe ${etiqueta} ${id} en tu empresa`);
  return registro;
}
const buscarCliente = (datos, id) => buscar(datos.clientes, id, 'CLIENTE_NO_ENCONTRADO', 'el cliente');
const buscarOportunidad = (datos, id) => buscar(datos.oportunidades, id, 'OPORTUNIDAD_NO_ENCONTRADA', 'la oportunidad');
const buscarCotizacion = (datos, id) => buscar(datos.cotizaciones, id, 'COTIZACION_NO_ENCONTRADA', 'la cotización');

const nombreCliente = (datos, id) => {
  const c = datos.clientes.find((x) => x.id === id);
  return c ? c.razonSocial : null;
};
const vistaOportunidad = (datos, o) => ({...o, clienteNombre: nombreCliente(datos, o.clienteId)});
const vistaCotizacion = (datos, c) => {
  const op = datos.oportunidades.find((o) => o.id === c.oportunidadId);
  return {...c, clienteNombre: nombreCliente(datos, c.clienteId), oportunidadTitulo: op ? op.titulo : null, facturada: datos.facturas.some((f) => f.cotizacionId === c.id)};
};

function exigirNitUnico(datos, nit, ignorarId) {
  const repetido = datos.clientes.find((c) => c.nit === nit && c.id !== ignorarId);
  if (repetido) throw new ErrorHttp(409, 'NIT_DUPLICADO', `Ya existe un cliente con el NIT ${nit}: ${repetido.razonSocial}`, {clienteId: repetido.id});
}

/* ------------------------------ Clientes y ficha 360° ------------------------------ */

function listarClientes(req, res) {
  const q = String(req.query.q || '').trim().toLowerCase();
  const {tipologia, zona} = req.query;
  const hoy = fechaLocalISO();
  const lista = req.datos.clientes
    .filter((c) => !tipologia || c.tipologia === tipologia)
    .filter((c) => !zona || c.zona === zona)
    .filter((c) => !q || [c.razonSocial, c.nit, c.contacto, c.ciudad, c.correo].some((t) => t.toLowerCase().includes(q)))
    .map((c) => ({...c, diasParaCumple: proximoCumple(c, hoy).dias}));
  res.json({clientes: lista, total: lista.length});
}

function ficha360(req, res) {
  const datos = req.datos;
  const cliente = buscarCliente(datos, req.params.id);
  const ficha = {
    cliente: {...cliente, diasParaCumple: proximoCumple(cliente, fechaLocalISO()).dias},
    interacciones: datos.interacciones.filter((i) => i.clienteId === cliente.id).sort((a, b) => b.fechaHora.localeCompare(a.fechaHora)),
    oportunidades: datos.oportunidades.filter((o) => o.clienteId === cliente.id),
    cotizaciones: datos.cotizaciones.filter((c) => c.clienteId === cliente.id).map((c) => vistaCotizacion(datos, c)),
    facturas: null,
    tickets: null,
    metricas: null,
    seccionesNoDisponibles: []
  };
  const secciones = [
    ['facturas', 'finanzas', () => datos.facturas.filter((f) => f.clienteId === cliente.id).map((f) => ({id: f.id, numero: f.numero, total: f.total, estadoPago: f.estadoPago, fechaEmision: f.fechaEmision}))],
    ['tickets', 'servicios', () => datos.tickets.filter((t) => t.clienteId === cliente.id).map((t) => ({id: t.id, asunto: t.asunto, estado: t.estado, prioridad: t.prioridad}))],
    ['metricas', 'motor_analitico', () => analitica.metricasDeCliente(datos, cliente.id)]
  ];
  for (const [campo, modulo, obtener] of secciones) {
    if (puedeLeer(req, modulo)) ficha[campo] = obtener();
    else ficha.seccionesNoDisponibles.push({seccion: campo, modulo, motivo: moduloActivo(datos, modulo) ? 'Tu rol no tiene acceso a ese módulo' : 'El módulo no está activo en tu empresa'});
  }
  res.json(ficha);
}

function crearCliente(req, res) {
  const datos = req.datos;
  const campos = validarCliente(req.body);
  exigirNitUnico(datos, campos.nit);
  const cliente = {id: datos.siguienteId('clientes'), cargo: '', direccion: '', ...campos, nombreComercial: campos.nombreComercial || campos.razonSocial, fechaRegistro: fechaLocalISO()};
  datos.clientes.push(cliente);
  datos.log('info', 'ventas_crm', `Cliente creado: ${cliente.razonSocial} (NIT ${cliente.nit})`, cliente);
  res.status(201).json({cliente});
}

function actualizarCliente(req, res) {
  const datos = req.datos;
  const cliente = buscarCliente(datos, req.params.id);
  const cambios = validarCliente(req.body, true);
  if (cambios.nit) exigirNitUnico(datos, cambios.nit, cliente.id);
  Object.assign(cliente, cambios);
  datos.log('info', 'ventas_crm', `Cliente actualizado: ${cliente.razonSocial}`, cambios);
  res.json({cliente});
}

function cumpleanos(req, res) {
  const dias = v.entero(req.query.dias === undefined ? 30 : Number(req.query.dias), 'dias', {min: 0, max: 365});
  res.json({desde: fechaLocalISO(), dias, cumpleanos: proximosCumpleanos(req.datos, dias)});
}

function registrarInteraccion(req, res) {
  const datos = req.datos;
  const cliente = buscarCliente(datos, req.params.id);
  const cuerpo = req.body || {};
  const interaccion = {
    id: datos.siguienteId('interacciones'),
    clienteId: cliente.id,
    canal: v.opcion(cuerpo.canal, 'canal', CANALES),
    tipo: v.opcion(cuerpo.tipo, 'tipo', TIPOS_INTERACCION),
    resumen: v.texto(cuerpo.resumen, 'resumen', {min: 5, max: 400}),
    responsable: req.auth.usuario.nombre,
    fechaHora: new Date().toISOString()
  };
  datos.interacciones.push(interaccion);
  datos.log('info', 'ventas_crm', `Interacción registrada con ${cliente.razonSocial} por ${interaccion.canal}`, interaccion);
  res.status(201).json({interaccion});
}

/* ------------------------------ Oportunidades y pipeline ------------------------------ */

function listarOportunidades(req, res) {
  const etapa = req.query.etapa;
  res.json({oportunidades: req.datos.oportunidades.filter((o) => !etapa || o.etapa === etapa).map((o) => vistaOportunidad(req.datos, o)), etapas: ETAPAS});
}

function crearOportunidad(req, res) {
  const datos = req.datos;
  const cuerpo = req.body || {};
  const clienteId = v.entero(cuerpo.clienteId, 'clienteId', {min: 1});
  buscarCliente(datos, clienteId);
  const etapa = v.opcion(cuerpo.etapa, 'etapa', ETAPAS.map((e) => e.id), {defecto: 'nuevo'});
  const oportunidad = {
    id: datos.siguienteId('oportunidades'),
    titulo: v.texto(cuerpo.titulo, 'titulo', {min: 3, max: 120}),
    clienteId,
    valorEstimado: v.numero(cuerpo.valorEstimado, 'valorEstimado', {min: 0, max: 1e11}),
    etapa,
    probabilidadCierre: ETAPAS.find((e) => e.id === etapa).probabilidad,
    responsable: req.auth.usuario.nombre,
    fechaEstimadaCierre: v.fecha(cuerpo.fechaEstimadaCierre, 'fechaEstimadaCierre', {opcional: true}) || sumarDias(fechaLocalISO(), 30),
    creada: fechaLocalISO()
  };
  datos.oportunidades.push(oportunidad);
  datos.log('info', 'ventas_crm', `Oportunidad creada: ${oportunidad.titulo}`, oportunidad);
  res.status(201).json({oportunidad: vistaOportunidad(datos, oportunidad)});
}

function moverEtapa(req, res) {
  const datos = req.datos;
  const oportunidad = buscarOportunidad(datos, req.params.id);
  const etapa = v.opcion((req.body || {}).etapa, 'etapa', ETAPAS.map((e) => e.id));
  const anterior = oportunidad.etapa;
  oportunidad.etapa = etapa;
  oportunidad.probabilidadCierre = ETAPAS.find((e) => e.id === etapa).probabilidad;
  oportunidad.fechaCierre = etapa === 'ganado' || etapa === 'perdido' ? fechaLocalISO() : null;
  datos.log('info', 'ventas_crm', `Pipeline: "${oportunidad.titulo}" pasó de ${anterior} a ${etapa}`, {oportunidadId: oportunidad.id, anterior, etapa});
  res.json({oportunidad: vistaOportunidad(datos, oportunidad)});
}

function pipeline(req, res) {
  const datos = req.datos;
  const columnas = ETAPAS.map((e) => {
    const lista = datos.oportunidades.filter((o) => o.etapa === e.id);
    const valor = lista.reduce((s, o) => s + o.valorEstimado, 0);
    return {...e, cantidad: lista.length, valor, valorPonderado: Math.round(valor * e.probabilidad / 100), oportunidades: lista.map((o) => vistaOportunidad(datos, o))};
  });
  const abiertas = columnas.filter((c) => c.id !== 'ganado' && c.id !== 'perdido');
  const ganadas = columnas.find((c) => c.id === 'ganado');
  const perdidas = columnas.find((c) => c.id === 'perdido');
  res.json({
    columnas,
    resumen: {
      pipelineAbierto: abiertas.reduce((s, c) => s + c.valor, 0),
      pronosticoPonderado: abiertas.reduce((s, c) => s + c.valorPonderado, 0),
      ganado: ganadas.valor,
      tasaCierre: ganadas.cantidad + perdidas.cantidad ? Math.round(ganadas.cantidad / (ganadas.cantidad + perdidas.cantidad) * 100) : 0
    }
  });
}

/* ------------------------------ Cotizaciones ------------------------------ */

function listarCotizaciones(req, res) {
  const estado = req.query.estado;
  res.json({cotizaciones: req.datos.cotizaciones.filter((c) => !estado || c.estado === estado).map((c) => vistaCotizacion(req.datos, c)).sort((a, b) => b.id - a.id)});
}

function crearCotizacion(req, res) {
  const datos = req.datos;
  const cuerpo = req.body || {};
  const oportunidad = buscarOportunidad(datos, v.entero(cuerpo.oportunidadId, 'oportunidadId', {min: 1}));
  const diasVigencia = v.entero(cuerpo.diasVigencia === undefined ? 15 : cuerpo.diasVigencia, 'diasVigencia', {min: 1, max: 180});
  const items = validarItems(datos, cuerpo.items, {registrarPreventa: true});
  const id = datos.siguienteId('cotizaciones');
  const hoy = fechaLocalISO();
  const cotizacion = {
    id, oportunidadId: oportunidad.id, clienteId: oportunidad.clienteId, numero: `COT-${String(id).padStart(4, '0')}`, items,
    ...calcularTotales(items), estado: 'borrador', diasVigencia, fechaEmision: hoy, fechaVencimiento: sumarDias(hoy, diasVigencia), vendedor: req.auth.usuario.nombre
  };
  datos.cotizaciones.push(cotizacion);
  datos.log('info', 'ventas_crm', `Cotización ${cotizacion.numero} elaborada por ${cotizacion.total} COP (reserva lógica de stock verificada)`, {cotizacionId: id, total: cotizacion.total});
  res.status(201).json({cotizacion: vistaCotizacion(datos, cotizacion)});
}

const TRANSICIONES = {borrador: ['enviada'], enviada: ['aceptada', 'rechazada'], aceptada: [], rechazada: []};

function cambiarEstadoCotizacion(req, res) {
  const datos = req.datos;
  const cotizacion = buscarCotizacion(datos, req.params.id);
  const estado = v.opcion((req.body || {}).estado, 'estado', ['enviada', 'aceptada', 'rechazada']);
  if (!TRANSICIONES[cotizacion.estado].includes(estado)) {
    throw new ErrorHttp(409, 'TRANSICION_INVALIDA', `Una cotización en estado "${cotizacion.estado}" no puede pasar a "${estado}"`, {permitidas: TRANSICIONES[cotizacion.estado]});
  }
  cotizacion.estado = estado;
  const oportunidad = datos.oportunidades.find((o) => o.id === cotizacion.oportunidadId);
  if (estado === 'enviada' && oportunidad && ['nuevo', 'calificado'].includes(oportunidad.etapa)) {
    oportunidad.etapa = 'propuesta';
    oportunidad.probabilidadCierre = 55;
  }
  if (estado === 'aceptada' && oportunidad) {
    oportunidad.etapa = 'ganado';
    oportunidad.probabilidadCierre = 100;
    oportunidad.fechaCierre = fechaLocalISO();
  }
  datos.log('info', 'ventas_crm', `Cotización ${cotizacion.numero}: ${estado}${estado === 'aceptada' ? '. Oportunidad cerrada como ganada; lista para facturar' : ''}`, {cotizacionId: cotizacion.id, estado});
  res.json({cotizacion: vistaCotizacion(datos, cotizacion)});
}

module.exports = {
  listarClientes, ficha360, crearCliente, actualizarCliente, cumpleanos, registrarInteraccion,
  listarOportunidades, crearOportunidad, moverEtapa, pipeline,
  listarCotizaciones, crearCotizacion, cambiarEstadoCotizacion,
  proximosCumpleanos, ETAPAS, TIPOLOGIAS, ZONAS
};
