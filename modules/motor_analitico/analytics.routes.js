'use strict';

const express = require('express');
const {asyncHandler} = require('../../core/http');
const controller = require('./analytics.controller');

const router = express.Router();

router.get('/clientes', asyncHandler(controller.clientes));
router.get('/clientes/:id', asyncHandler(controller.cliente));
router.get('/indicadores', asyncHandler(controller.indicadores));
router.get('/comisiones', asyncHandler(controller.comisiones));
router.get('/modelo', asyncHandler(controller.obtenerModelo));
router.put('/modelo', asyncHandler(controller.actualizarModelo));
router.post('/planificar', asyncHandler(controller.planificar));

module.exports = router;
