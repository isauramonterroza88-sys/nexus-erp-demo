'use strict';

const {db} = require('../../core/database');
const {ErrorHttp, v} = require('../../core/http');

const PRIORIDADES = ['alta', 'media', 'baja'];
const ESTADOS = ['abierto', 'en_curso', 'resuelto'];
const SLA_HORAS = {alta: 24, media: 72, baja: 168};

function buscarTicket(datos, id) {
  const ticket = datos.tickets.find((t) => t.id === Number(id));
  if (!ticket) throw new ErrorHttp(404, 'TICKET_NO_ENCONTRADO', `No existe la orden de soporte ${id} en tu empresa`);
  return ticket;
}

function vistaTicket(datos, t) {
  const cliente = datos.clientes.find((c) => c.id === t.clienteId);
  const fin = t.resuelto ? new Date(t.resuelto).getTime() : Date.now();
  const horasTranscurridas = (fin - new Date(t.creado).getTime()) / 3600000;
  const restantes = SLA_HORAS[t.prioridad] - horasTranscurridas;
  return {
    ...t, clienteNombre: cliente ? cliente.razonSocial : 'Cliente eliminado', slaHoras: SLA_HORAS[t.prioridad],
    horasTranscurridas: Math.round(horasTranscurridas * 10) / 10, horasRestantes: Math.round(restantes * 10) / 10, slaVencido: restantes < 0,
    cumpleSla: t.resuelto ? restantes >= 0 : null
  };
}

function agregarHistorial(ticket, tipo, autor, detalle) {
  ticket.historial.push({ts: new Date().toISOString(), tipo, autor, detalle});
}

function listar(req, res) {
  const {estado, prioridad, clienteId} = req.query;
  const lista = req.datos.tickets
    .filter((t) => !estado || t.estado === estado)
    .filter((t) => !prioridad || t.prioridad === prioridad)
    .filter((t) => !clienteId || t.clienteId === Number(clienteId))
    .map((t) => vistaTicket(req.datos, t))
    .sort((a, b) => b.id - a.id);
  res.json({tickets: lista, total: lista.length});
}

function obtener(req, res) {
  res.json({ticket: vistaTicket(req.datos, buscarTicket(req.datos, req.params.id))});
}

function crear(req, res) {
  const datos = req.datos;
  const cuerpo = req.body || {};
  const clienteId = v.entero(cuerpo.clienteId, 'clienteId', {min: 1});
  const cliente = datos.clientes.find((c) => c.id === clienteId);
  if (!cliente) throw new ErrorHttp(404, 'CLIENTE_NO_ENCONTRADO', `No existe el cliente ${clienteId} en tu empresa`);
  const facturaId = v.entero(cuerpo.facturaId, 'facturaId', {min: 1, opcional: true});
  if (facturaId !== undefined && !datos.facturas.some((f) => f.id === facturaId && f.clienteId === clienteId)) {
    throw new ErrorHttp(422, 'FACTURA_NO_VINCULABLE', `La factura ${facturaId} no existe o no pertenece a ${cliente.razonSocial}`);
  }
  const ticket = {
    id: datos.siguienteId('tickets'), asunto: v.texto(cuerpo.asunto, 'asunto', {min: 5, max: 160}), clienteId,
    prioridad: v.opcion(cuerpo.prioridad, 'prioridad', PRIORIDADES, {defecto: 'media'}), estado: 'abierto', asignadoA: null,
    creado: new Date().toISOString(), resuelto: null, facturaId: facturaId === undefined ? null : facturaId, historial: []
  };
  agregarHistorial(ticket, 'creado', req.auth.usuario.nombre, `Orden registrada para ${cliente.razonSocial}${facturaId ? ` (posventa de la factura ${facturaId})` : ''}`);
  datos.tickets.push(ticket);
  datos.log('info', 'servicios', `Orden de soporte #${ticket.id} creada: ${ticket.asunto} (${ticket.prioridad})`, ticket);
  res.status(201).json({ticket: vistaTicket(datos, ticket)});
}

function asignar(req, res) {
  const datos = req.datos;
  const ticket = buscarTicket(datos, req.params.id);
  const usuarioId = v.entero((req.body || {}).usuarioId === undefined ? req.auth.usuario.id : req.body.usuarioId, 'usuarioId', {min: 1});
  const usuario = db.usuarios.find((u) => u.id === usuarioId && u.empresaId === datos.empresaId && u.activo);
  if (!usuario) throw new ErrorHttp(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe o no pertenece a tu empresa');
  ticket.asignadoA = usuario.nombre;
  if (ticket.estado === 'abierto') ticket.estado = 'en_curso';
  agregarHistorial(ticket, 'asignado', req.auth.usuario.nombre, `Asignada a ${usuario.nombre}`);
  datos.log('info', 'servicios', `Orden #${ticket.id} asignada a ${usuario.nombre}`, {ticketId: ticket.id});
  res.json({ticket: vistaTicket(datos, ticket)});
}

function cambiarEstado(req, res) {
  const datos = req.datos;
  const ticket = buscarTicket(datos, req.params.id);
  const estado = v.opcion((req.body || {}).estado, 'estado', ESTADOS);
  if (estado === ticket.estado) throw new ErrorHttp(409, 'SIN_CAMBIO', `La orden ya está en estado ${estado}`);
  ticket.estado = estado;
  ticket.resuelto = estado === 'resuelto' ? new Date().toISOString() : null;
  if (!ticket.asignadoA && estado !== 'abierto') ticket.asignadoA = req.auth.usuario.nombre;
  agregarHistorial(ticket, 'estado', req.auth.usuario.nombre, `Estado: ${estado}`);
  datos.log('info', 'servicios', `Orden #${ticket.id}: estado ${estado}`, {ticketId: ticket.id, estado});
  res.json({ticket: vistaTicket(datos, ticket)});
}

function comentar(req, res) {
  const datos = req.datos;
  const ticket = buscarTicket(datos, req.params.id);
  agregarHistorial(ticket, 'comentario', req.auth.usuario.nombre, v.texto((req.body || {}).texto, 'texto', {min: 2, max: 400}));
  res.status(201).json({ticket: vistaTicket(datos, ticket)});
}

function resumen(req, res) {
  const datos = req.datos;
  const vistas = datos.tickets.map((t) => vistaTicket(datos, t));
  const resueltos = vistas.filter((t) => t.estado === 'resuelto');
  res.json({
    total: vistas.length,
    porEstado: Object.fromEntries(ESTADOS.map((e) => [e, vistas.filter((t) => t.estado === e).length])),
    slaVencidos: vistas.filter((t) => t.estado !== 'resuelto' && t.slaVencido).length,
    cumplimientoSla: resueltos.length ? Math.round(resueltos.filter((t) => t.cumpleSla).length / resueltos.length * 100) : null,
    altaPrioridadAbiertos: vistas.filter((t) => t.estado !== 'resuelto' && t.prioridad === 'alta').length
  });
}

module.exports = {listar, obtener, crear, asignar, cambiarEstado, comentar, resumen};
