'use strict';

const {suscribir, fechaLocalISO} = require('../../core/database');
const {ErrorHttp, v} = require('../../core/http');
const {cop, capDiaria, cupoDisponible, mensajesDeHoy, registrarMensaje} = require('../../core/mensajeria');
const analitica = require('../motor_analitico/analytics.service');
const {TIPOLOGIAS, ZONAS} = require('../ventas_crm/crm.controller');

function buscarCampana(datos, id) {
  const campana = datos.campanas.find((c) => c.id === Number(id));
  if (!campana) throw new ErrorHttp(404, 'CAMPANA_NO_ENCONTRADA', `No existe la campaña ${id} en tu empresa`);
  return campana;
}

function camposCampana(cuerpo, parcial) {
  const c = cuerpo || {};
  const salida = {};
  const poner = (campo, valor) => {
    if (!(parcial && c[campo] === undefined)) salida[campo] = valor();
  };
  poner('nombre', () => v.texto(c.nombre, 'nombre', {min: 3, max: 80}));
  poner('mensaje', () => v.texto(c.mensaje, 'mensaje', {min: 10, max: 300}));
  poner('descuentoPct', () => v.numero(c.descuentoPct === undefined ? 0 : c.descuentoPct, 'descuentoPct', {min: 0, max: 60}));
  poner('tipologias', () => v.listaDeOpciones(c.tipologias, 'tipologias', TIPOLOGIAS));
  poner('zonas', () => v.listaDeOpciones(c.zonas, 'zonas', ZONAS));
  poner('clases', () => v.listaDeOpciones(c.clases, 'clases', analitica.CLASES));
  return salida;
}

function alcanceDe(datos, campana) {
  const ctx = analitica.contextoPlanificacion(datos, [campana]);
  const pertinentes = ctx.clientes.filter((c) =>
    (!campana.tipologias.length || campana.tipologias.includes(c.tipologia)) &&
    (!campana.zonas.length || campana.zonas.includes(c.zona)) &&
    (!campana.clases.length || campana.clases.includes(c.clase)));
  return {pertinentes: pertinentes.length, conCanalDigital: pertinentes.filter((c) => c.canalDigital).length, sinCanalDigital: pertinentes.filter((c) => !c.canalDigital).length};
}

const vistaCampana = (datos, c) => ({
  ...c,
  alcance: alcanceDe(datos, c),
  enviados: datos.mensajes.filter((m) => m.campanaId === c.id).length
});

function segmentos(req, res) {
  const metricas = analitica.calcularMetricas(req.datos);
  const contar = (campo, valores) => Object.fromEntries(valores.map((x) => [x, metricas.filter((m) => m[campo] === x).length]));
  res.json({
    totalClientes: metricas.length,
    porClase: contar('clase', analitica.CLASES),
    porTipologia: contar('tipologia', TIPOLOGIAS),
    porZona: contar('zona', ZONAS),
    coberturaCanalDigital: metricas.length ? Math.round(metricas.filter((m) => m.canalDigital).length / metricas.length * 100) : 0,
    cumplenHoy: req.datos.clientes.filter((c) => c.estadoCuenta === 'activo' && c.fechaCumpleanos.slice(5) === fechaLocalISO().slice(5)).map((c) => ({id: c.id, razonSocial: c.razonSocial, contacto: c.contacto}))
  });
}

function listar(req, res) {
  res.json({campanas: req.datos.campanas.map((c) => vistaCampana(req.datos, c)).sort((a, b) => b.id - a.id)});
}

function crear(req, res) {
  const datos = req.datos;
  const campana = {id: datos.siguienteId('campanas'), ...camposCampana(req.body, false), estado: 'borrador', creada: fechaLocalISO(), creadaPor: req.auth.usuario.nombre, ejecuciones: 0};
  datos.campanas.push(campana);
  datos.log('info', 'marketing', `Campaña creada: ${campana.nombre}`, campana);
  res.status(201).json({campana: vistaCampana(datos, campana)});
}

function actualizar(req, res) {
  const datos = req.datos;
  const campana = buscarCampana(datos, req.params.id);
  if (campana.estado === 'cerrada') throw new ErrorHttp(409, 'CAMPANA_CERRADA', 'Una campaña cerrada no se puede modificar');
  Object.assign(campana, camposCampana(req.body, true));
  datos.log('info', 'marketing', `Campaña actualizada: ${campana.nombre}`, null);
  res.json({campana: vistaCampana(datos, campana)});
}

function cerrar(req, res) {
  const campana = buscarCampana(req.datos, req.params.id);
  campana.estado = 'cerrada';
  req.datos.log('info', 'marketing', `Campaña cerrada: ${campana.nombre}`, null);
  res.json({campana: vistaCampana(req.datos, campana)});
}

/* Ejecución: el motor analítico reserva primero el cupo de las facturas por despachar y reparte el resto por Score */
function ejecutar(req, res) {
  const datos = req.datos;
  const campana = buscarCampana(datos, req.params.id);
  if (campana.estado === 'cerrada') throw new ErrorHttp(409, 'CAMPANA_CERRADA', 'Una campaña cerrada no se puede ejecutar');
  const cuerpo = req.body || {};
  const contexto = analitica.contextoPlanificacion(datos, [campana]);
  if (cuerpo.topePorCliente !== undefined) contexto.topePorCliente = cuerpo.topePorCliente === null ? null : v.entero(cuerpo.topePorCliente, 'topePorCliente', {min: 1, max: 20});
  const plan = analitica.planificarEnvios(contexto);
  const porId = new Map(datos.clientes.map((c) => [c.id, c]));
  const mensajes = plan.promociones.map((p) => {
    const cliente = porId.get(p.clienteId);
    const texto = `Hola ${cliente.contacto.split(' ')[0]}, ${campana.mensaje}${campana.descuentoPct ? ` (${campana.descuentoPct} % de descuento)` : ''}`;
    return registrarMensaje(datos, {tipo: 'promocion', cliente, plantilla: 'promocion', parametros: [texto], campanaId: campana.id, score: p.score});
  });
  campana.estado = 'activa';
  campana.ejecuciones += 1;
  campana.ultimaEjecucion = new Date().toISOString();
  datos.log('info', 'marketing', `Campaña "${campana.nombre}" ejecutada: ${plan.facturas.length} cupos reservados para facturas, ${mensajes.length} promociones enviadas por Score, ${plan.sinCupo} pares sin cupo`, {cuota: plan.cap, objetivo: plan.objetivo});
  res.json({
    campana: vistaCampana(datos, campana),
    plan: {cuotaDisponible: plan.cap, cuposReservadosParaFacturas: plan.facturas.length, promocionesEnviadas: mensajes.length, paresSinCupo: plan.sinCupo, cupoLibre: plan.cupoLibre, excluidasPorR2: plan.excluidasPorR2, objetivo: plan.objetivo},
    mensajes: mensajes.map((m) => ({id: m.id, clienteNombre: m.clienteNombre, score: m.score}))
  });
}

function mensajes(req, res) {
  const datos = req.datos;
  const {tipo} = req.query;
  const limite = v.entero(req.query.limite === undefined ? 100 : Number(req.query.limite), 'limite', {min: 1, max: 500});
  const lista = datos.mensajes.filter((m) => !tipo || m.tipo === tipo).slice().reverse().slice(0, limite);
  res.json({mensajes: lista, total: lista.length, cuota: cuota(datos)});
}

function cuota(datos) {
  const hoy = mensajesDeHoy(datos);
  const facturadas = new Set(datos.facturas.map((f) => f.cotizacionId).filter(Boolean));
  return {
    capDiaria: capDiaria(datos), usadoHoy: hoy.length, usadoFacturas: hoy.filter((m) => m.tipo === 'factura').length,
    usadoPromociones: hoy.filter((m) => m.tipo === 'promocion').length, disponible: cupoDisponible(datos),
    reservadoParaFacturas: datos.cotizaciones.filter((c) => c.estado === 'aceptada' && !facturadas.has(c.id)).length
  };
}

function verCuota(req, res) {
  res.json({cuota: cuota(req.datos)});
}

function actualizarCuota(req, res) {
  const cuerpo = req.body || {};
  const marketing = req.datos.config.marketing;
  if (cuerpo.capDiaria !== undefined) marketing.capDiaria = v.entero(cuerpo.capDiaria, 'capDiaria', {min: 1, max: 100000});
  if (cuerpo.topePorCliente !== undefined) marketing.topePorCliente = cuerpo.topePorCliente === null ? null : v.entero(cuerpo.topePorCliente, 'topePorCliente', {min: 1, max: 20});
  req.datos.log('info', 'marketing', `Cuota de mensajes actualizada: ${marketing.capDiaria} por día, tope por cliente ${marketing.topePorCliente === null ? 'sin tope' : marketing.topePorCliente}`, marketing);
  res.json({config: marketing, cuota: cuota(req.datos)});
}

/* Confirmación de pago por canal digital, solo si Marketing está activo y hay cupo (prioridad después de las facturas) */
function confirmarPago(payload, datos) {
  const cliente = datos.clientes.find((c) => c.id === payload.clienteId);
  if (!cliente || !cliente.canalDigital) return {enviado: false, motivo: 'Cliente sin canal digital validado'};
  if (cupoDisponible(datos) === 0) return {enviado: false, motivo: 'Cuota diaria agotada'};
  const mensaje = registrarMensaje(datos, {tipo: 'confirmacion', cliente, plantilla: 'confirmacion_pago', parametros: [cliente.contacto.split(' ')[0], cop(payload.total), payload.numero], referencia: payload.numero});
  return {enviado: true, mensajeId: mensaje.id};
}

function init() {
  suscribir('factura.pagada', 'marketing', 'Enviando la confirmación de pago por el canal digital', confirmarPago, 200);
}

module.exports = {segmentos, listar, crear, actualizar, cerrar, ejecutar, mensajes, verCuota, actualizarCuota, init};
