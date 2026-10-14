'use strict';

const {suscribir} = require('../../core/database');
const {ErrorHttp, invalido, v} = require('../../core/http');
const servicio = require('./analytics.service');

function clientes(req, res) {
  const clase = req.query.clase;
  if (clase !== undefined && !servicio.CLASES.includes(clase)) throw invalido('clase', `debe ser una de: ${servicio.CLASES.join(', ')}`);
  const lista = servicio.calcularMetricas(req.datos).filter((m) => !clase || m.clase === clase).sort((a, b) => b.score - a.score);
  const distribucion = Object.fromEntries(servicio.CLASES.map((k) => [k, lista.filter((m) => m.clase === k).length]));
  res.json({clientes: lista, total: lista.length, distribucion, modelo: req.datos.config.analitico});
}

function cliente(req, res) {
  const metricas = servicio.metricasDeCliente(req.datos, Number(req.params.id));
  if (!metricas) throw new ErrorHttp(404, 'CLIENTE_NO_ENCONTRADO', `No hay métricas para el cliente ${req.params.id} (¿existe y está activo?)`);
  res.json({metricas});
}

function indicadores(req, res) {
  res.json({indicadores: servicio.indicadores(req.datos), generado: new Date().toISOString()});
}

function comisiones(req, res) {
  res.json(servicio.comisiones(req.datos));
}

function obtenerModelo(req, res) {
  res.json({analitico: req.datos.config.analitico, marketing: req.datos.config.marketing});
}

function actualizarModelo(req, res) {
  const cuerpo = req.body || {};
  const actual = req.datos.config.analitico;
  const nuevo = {...actual, umbrales: {...actual.umbrales}, geo: {...actual.geo}};
  for (const campo of ['wR', 'wF', 'wM', 'wRFM', 'wGeo']) {
    if (cuerpo[campo] !== undefined) nuevo[campo] = v.numero(cuerpo[campo], campo, {min: 0, max: 1});
  }
  if (cuerpo.ventanaSemanas !== undefined) nuevo.ventanaSemanas = v.entero(cuerpo.ventanaSemanas, 'ventanaSemanas', {min: 4, max: 12});
  if (cuerpo.comisionPct !== undefined) nuevo.comisionPct = v.numero(cuerpo.comisionPct, 'comisionPct', {min: 0, max: 20});
  if (cuerpo.umbrales) {
    for (const k of ['aaa', 'aa', 'a', 'b', 'frecuenciaMinAaa']) {
      if (cuerpo.umbrales[k] !== undefined) nuevo.umbrales[k] = v.numero(cuerpo.umbrales[k], `umbrales.${k}`, {min: 0, max: 1});
    }
  }
  if (Math.abs(nuevo.wR + nuevo.wF + nuevo.wM - 1) > 0.001) throw invalido('wR', 'los pesos wR + wF + wM deben sumar 1');
  if (Math.abs(nuevo.wRFM + nuevo.wGeo - 1) > 0.001) throw invalido('wRFM', 'los pesos wRFM + wGeo deben sumar 1');
  const u = nuevo.umbrales;
  if (!(u.aaa > u.aa && u.aa > u.a && u.a > u.b && u.b > 0)) throw invalido('umbrales', 'deben ser decrecientes: AAA > AA > A > B > 0');
  req.datos.config.analitico = nuevo;
  req.datos.log('info', 'motor_analitico', 'Parámetros del modelo analítico actualizados. La segmentación se recalcula con los nuevos pesos', nuevo);
  res.json({analitico: nuevo});
}

function planificar(req, res) {
  const cuerpo = req.body || {};
  const campanas = req.datos.campanas.filter((c) => c.estado !== 'cerrada');
  const ids = Array.isArray(cuerpo.campanaIds) ? cuerpo.campanaIds.map(Number) : null;
  const contexto = servicio.contextoPlanificacion(req.datos, campanas.filter((c) => !ids || ids.includes(c.id)));
  if (cuerpo.cuota !== undefined) contexto.cap = v.entero(cuerpo.cuota, 'cuota', {min: 0, max: 100000});
  if (cuerpo.topePorCliente !== undefined) contexto.topePorCliente = cuerpo.topePorCliente === null ? null : v.entero(cuerpo.topePorCliente, 'topePorCliente', {min: 1, max: 20});
  const plan = servicio.planificarEnvios(contexto);
  req.datos.log('info', 'motor_analitico', `Plan de envíos: ${plan.facturas.length} facturas reservadas, ${plan.promociones.length} promociones asignadas, cupo libre ${plan.cupoLibre}`, {cuota: plan.cap, objetivo: plan.objetivo});
  res.json({plan: {...plan, facturas: plan.facturas, promociones: plan.promociones.map((p) => ({...p, clienteNombre: (contexto.clientes.find((c) => c.id === p.clienteId) || {}).razonSocial}))}});
}

function actualizarMetricasPorPago(payload, datos) {
  const m = servicio.metricasDeCliente(datos, payload.clienteId);
  if (!m) return {actualizado: false};
  datos.log('info', 'motor_analitico', `Métricas recalculadas para el cliente ${payload.clienteId}: clase ${m.clase}, score ${m.score}, LTV ${m.ltv}`, m);
  return {actualizado: true, clase: m.clase, score: m.score, ltv: m.ltv};
}

function init() {
  suscribir('factura.pagada', 'motor_analitico', 'Recalculando métricas del cliente (LTV, recencia, retención y segmento)', actualizarMetricasPorPago, 100);
}

module.exports = {clientes, cliente, indicadores, comisiones, obtenerModelo, actualizarModelo, planificar, init};
