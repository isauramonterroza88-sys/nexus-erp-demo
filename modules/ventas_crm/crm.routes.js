'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const controller = require('./crm.controller');

const router = express.Router();

router.get('/clientes', asyncHandler(controller.listarClientes));
router.get('/clientes/cumpleanos', asyncHandler(controller.cumpleanos));
router.get('/clientes/:id/ficha', asyncHandler(controller.ficha360));
router.post('/clientes', asyncHandler(controller.crearCliente));
router.patch('/clientes/:id', asyncHandler(controller.actualizarCliente));
router.post('/clientes/:id/interacciones', asyncHandler(controller.registrarInteraccion));

router.get('/oportunidades', asyncHandler(controller.listarOportunidades));
router.post('/oportunidades', asyncHandler(controller.crearOportunidad));
router.patch('/oportunidades/:id/etapa', asyncHandler(controller.moverEtapa));
router.get('/pipeline', asyncHandler(controller.pipeline));

router.get('/cotizaciones', asyncHandler(controller.listarCotizaciones));
router.post('/cotizaciones', asyncHandler(controller.crearCotizacion));
router.patch('/cotizaciones/:id/estado', asyncHandler(controller.cambiarEstadoCotizacion));

module.exports = router;
