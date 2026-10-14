'use strict';

const {fechaLocalISO, diasEntre} = require('../../core/database');
const {ErrorHttp, v} = require('../../core/http');

const CONTRATOS = ['indefinido', 'fijo', 'prestacion_servicios', 'aprendizaje'];
const ESTADOS = ['activo', 'inactivo', 'licencia'];

function buscarEmpleado(datos, id) {
  const empleado = datos.empleados.find((e) => e.id === Number(id));
  if (!empleado) throw new ErrorHttp(404, 'EMPLEADO_NO_ENCONTRADO', `No existe el empleado ${id} en tu empresa`);
  return empleado;
}

const antiguedadAnios = (e) => Math.round(diasEntre(e.fechaIngreso, fechaLocalISO()) / 365.25 * 10) / 10;

function promedioEvaluaciones(datos, empleadoId) {
  const lista = datos.evaluaciones.filter((x) => x.empleadoId === empleadoId);
  return lista.length ? Math.round(lista.reduce((s, x) => s + x.calificacion, 0) / lista.length * 100) / 100 : null;
}

const vistaEmpleado = (datos, e) => ({...e, antiguedadAnios: antiguedadAnios(e), promedioDesempeno: promedioEvaluaciones(datos, e.id)});

function listar(req, res) {
  const q = String(req.query.q || '').trim().toLowerCase();
  const {area, estado} = req.query;
  const lista = req.datos.empleados
    .filter((e) => !area || e.area === area)
    .filter((e) => !estado || e.estado === estado)
    .filter((e) => !q || [e.nombre, e.cargo, e.area, e.documento].some((t) => t.toLowerCase().includes(q)))
    .map((e) => vistaEmpleado(req.datos, e));
  res.json({empleados: lista, total: lista.length});
}

function perfil(req, res) {
  const datos = req.datos;
  const empleado = buscarEmpleado(datos, req.params.id);
  res.json({empleado: vistaEmpleado(datos, empleado), evaluaciones: datos.evaluaciones.filter((x) => x.empleadoId === empleado.id)});
}

function crear(req, res) {
  const datos = req.datos;
  const cuerpo = req.body || {};
  const documento = v.texto(cuerpo.documento, 'documento', {min: 5, max: 20});
  if (datos.empleados.some((e) => e.documento === documento)) throw new ErrorHttp(409, 'DOCUMENTO_DUPLICADO', `Ya existe un empleado con el documento ${documento}`);
  const empleado = {
    id: datos.siguienteId('empleados'), nombre: v.texto(cuerpo.nombre, 'nombre', {min: 3, max: 80}), documento,
    cargo: v.texto(cuerpo.cargo, 'cargo', {max: 80}), area: v.texto(cuerpo.area, 'area', {max: 60}),
    contrato: v.opcion(cuerpo.contrato, 'contrato', CONTRATOS, {defecto: 'indefinido'}),
    salarioBase: v.numero(cuerpo.salarioBase, 'salarioBase', {min: 0, max: 1e9}),
    fechaNacimiento: v.fecha(cuerpo.fechaNacimiento, 'fechaNacimiento', {noFutura: true}),
    fechaIngreso: v.fecha(cuerpo.fechaIngreso, 'fechaIngreso', {opcional: true}) || fechaLocalISO(),
    correo: v.email(cuerpo.correo, 'correo'), estado: 'activo'
  };
  datos.empleados.push(empleado);
  datos.log('info', 'recursos_humanos', `Empleado registrado: ${empleado.nombre} (${empleado.cargo})`, {id: empleado.id, area: empleado.area});
  res.status(201).json({empleado: vistaEmpleado(datos, empleado)});
}

function actualizar(req, res) {
  const datos = req.datos;
  const empleado = buscarEmpleado(datos, req.params.id);
  const cuerpo = req.body || {};
  const cambios = {};
  if (cuerpo.cargo !== undefined) cambios.cargo = v.texto(cuerpo.cargo, 'cargo', {max: 80});
  if (cuerpo.area !== undefined) cambios.area = v.texto(cuerpo.area, 'area', {max: 60});
  if (cuerpo.contrato !== undefined) cambios.contrato = v.opcion(cuerpo.contrato, 'contrato', CONTRATOS);
  if (cuerpo.salarioBase !== undefined) cambios.salarioBase = v.numero(cuerpo.salarioBase, 'salarioBase', {min: 0, max: 1e9});
  if (cuerpo.estado !== undefined) cambios.estado = v.opcion(cuerpo.estado, 'estado', ESTADOS);
  if (cuerpo.correo !== undefined) cambios.correo = v.email(cuerpo.correo, 'correo');
  Object.assign(empleado, cambios);
  datos.log('info', 'recursos_humanos', `Perfil actualizado: ${empleado.nombre}`, cambios);
  res.json({empleado: vistaEmpleado(datos, empleado)});
}

function evaluar(req, res) {
  const datos = req.datos;
  const empleado = buscarEmpleado(datos, req.params.id);
  const cuerpo = req.body || {};
  const evaluacion = {
    id: datos.siguienteId('evaluaciones'), empleadoId: empleado.id, periodo: v.texto(cuerpo.periodo, 'periodo', {max: 20}),
    calificacion: v.numero(cuerpo.calificacion, 'calificacion', {min: 1, max: 5}), comentario: v.texto(cuerpo.comentario, 'comentario', {max: 300, opcional: true}) || '',
    evaluador: req.auth.usuario.nombre
  };
  datos.evaluaciones.push(evaluacion);
  datos.log('info', 'recursos_humanos', `Evaluación ${evaluacion.periodo} registrada para ${empleado.nombre}: ${evaluacion.calificacion}`, evaluacion);
  res.status(201).json({evaluacion, promedioDesempeno: promedioEvaluaciones(datos, empleado.id)});
}

function resumen(req, res) {
  const datos = req.datos;
  const activos = datos.empleados.filter((e) => e.estado === 'activo');
  const porArea = {};
  for (const e of activos) {
    const fila = porArea[e.area] || (porArea[e.area] = {area: e.area, personas: 0, nomina: 0});
    fila.personas += 1;
    fila.nomina += e.salarioBase;
  }
  const contratos = {};
  for (const e of activos) contratos[e.contrato] = (contratos[e.contrato] || 0) + 1;
  res.json({
    totalPersonal: datos.empleados.length, activos: activos.length, nominaMensual: activos.reduce((s, e) => s + e.salarioBase, 0),
    antiguedadPromedio: activos.length ? Math.round(activos.reduce((s, e) => s + antiguedadAnios(e), 0) / activos.length * 10) / 10 : 0,
    porArea: Object.values(porArea).sort((a, b) => b.personas - a.personas), contratos
  });
}

module.exports = {listar, perfil, crear, actualizar, evaluar, resumen};
